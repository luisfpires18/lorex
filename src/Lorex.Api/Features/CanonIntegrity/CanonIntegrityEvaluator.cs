using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity;

/// <summary>
/// What one evaluation did. Counts only; the conflicts themselves are read back.
/// <c>Resolved</c> covers every conflict that stopped being detected, dismissed ones
/// included.
/// </summary>
public sealed record CanonEvaluationSummary(
    int Detected,
    int Created,
    int Reopened,
    int Persisted,
    int Resolved,
    DateTime EvaluatedAt);

/// <summary>
/// Runs every registered rule over one universe and reconciles what they found against
/// what is already recorded.
///
/// Evaluation is idempotent: running it twice over unchanged lore leaves the table exactly
/// as the first run left it, because a finding is matched to a stored conflict by
/// fingerprint rather than by anything about when or how it was found.
///
/// Ownership is not checked here. The caller proves it, and this class is never reached
/// from anywhere that has not.
/// </summary>
public sealed class CanonIntegrityEvaluator(LorexDbContext db, IEnumerable<ICanonIntegrityRule> rules)
{
    public async Task<CanonEvaluationSummary> EvaluateAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var findings = await CollectAsync(universeId, cancellationToken);

        var existing = await db.CanonConflicts
            .Include(conflict => conflict.Subjects)
            .Where(conflict => conflict.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var stored = existing.ToDictionary(conflict => conflict.Fingerprint, StringComparer.Ordinal);
        var now = DateTime.UtcNow;

        int created = 0, reopened = 0, persisted = 0, resolved = 0;

        foreach (var finding in findings.Values)
        {
            if (!stored.TryGetValue(finding.Fingerprint, out var conflict))
            {
                db.CanonConflicts.Add(Open(universeId, finding, now));
                created++;
                continue;
            }

            var changed = Refresh(conflict, finding);

            if (conflict.Status == CanonConflictStatus.Resolved)
            {
                // The same issue, by fingerprint, is being detected again. A conflict the
                // author dismissed is left alone instead: a dismissal suppresses an issue
                // that is still there, and reopening it every time evaluation ran would
                // undo that decision immediately.
                conflict.Status = CanonConflictStatus.Pending;
                conflict.ResolvedAt = null;
                changed = true;
                reopened++;
            }
            else
            {
                persisted++;
            }

            if (changed)
            {
                conflict.UpdatedAt = now;
            }
        }

        foreach (var conflict in existing.Where(conflict =>
            conflict.Status != CanonConflictStatus.Resolved
            && !findings.ContainsKey(conflict.Fingerprint)))
        {
            // The underlying issue is gone. A dismissed conflict is resolved here too: a
            // dismissal suppresses an issue that is still there, not the fingerprint
            // forever. Once the issue is actually fixed there is nothing left to suppress,
            // and if the very same issue is reintroduced later it deserves to be raised
            // again rather than swallowed by a decision made about the old occurrence.
            conflict.Status = CanonConflictStatus.Resolved;
            conflict.ResolvedAt = now;
            conflict.UpdatedAt = now;
            resolved++;
        }

        await db.SaveChangesAsync(cancellationToken);

        return new CanonEvaluationSummary(findings.Count, created, reopened, persisted, resolved, now);
    }

    /// <summary>
    /// Every rule's findings, keyed by fingerprint. Rules run in rule-code order so a
    /// collision between two rules resolves the same way on every run; in practice the
    /// rule code is part of the fingerprint, so one cannot happen between different rules.
    /// </summary>
    private async Task<Dictionary<string, CanonFinding>> CollectAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var context = new CanonRuleContext(db, universeId);
        var findings = new Dictionary<string, CanonFinding>(StringComparer.Ordinal);

        foreach (var rule in rules.OrderBy(rule => rule.RuleCode, StringComparer.Ordinal))
        {
            foreach (var finding in await rule.EvaluateAsync(context, cancellationToken))
            {
                findings.TryAdd(finding.Fingerprint, finding);
            }
        }

        return findings;
    }

    private static CanonConflict Open(Guid universeId, CanonFinding finding, DateTime now)
    {
        var conflict = new CanonConflict
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            RuleCode = finding.RuleCode,
            Severity = finding.Severity,
            Status = CanonConflictStatus.Pending,
            Fingerprint = finding.Fingerprint,
            Title = finding.Title,
            Explanation = finding.Explanation,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var subject in finding.Subjects)
        {
            conflict.Subjects.Add(new CanonConflictSubject
            {
                SubjectKind = subject.Kind,
                SubjectId = subject.SubjectId,
                Role = subject.Role,
            });
        }

        return conflict;
    }

    /// <summary>
    /// Brings a stored conflict up to date with what the rule says now, and reports whether
    /// anything actually moved. Names are not part of the fingerprint, so renaming a
    /// character rewrites this conflict's wording rather than opening a second one; when
    /// nothing has changed, <c>UpdatedAt</c> is left alone so a repeated evaluation is
    /// invisible from the outside.
    /// </summary>
    private static bool Refresh(CanonConflict conflict, CanonFinding finding)
    {
        var changed = false;

        if (conflict.Severity != finding.Severity)
        {
            conflict.Severity = finding.Severity;
            changed = true;
        }

        if (!string.Equals(conflict.Title, finding.Title, StringComparison.Ordinal))
        {
            conflict.Title = finding.Title;
            changed = true;
        }

        if (!string.Equals(conflict.Explanation, finding.Explanation, StringComparison.Ordinal))
        {
            conflict.Explanation = finding.Explanation;
            changed = true;
        }

        return SyncSubjects(conflict, finding) || changed;
    }

    private static bool SyncSubjects(CanonConflict conflict, CanonFinding finding)
    {
        var wanted = finding.Subjects
            .Select(subject => (subject.Kind, subject.SubjectId, subject.Role))
            .ToHashSet();

        var changed = false;

        foreach (var subject in conflict.Subjects
            .Where(subject => !wanted.Contains((subject.SubjectKind, subject.SubjectId, subject.Role)))
            .ToList())
        {
            conflict.Subjects.Remove(subject);
            changed = true;
        }

        var held = conflict.Subjects
            .Select(subject => (subject.SubjectKind, subject.SubjectId, subject.Role))
            .ToHashSet();

        foreach (var subject in finding.Subjects
            .Where(subject => !held.Contains((subject.Kind, subject.SubjectId, subject.Role))))
        {
            conflict.Subjects.Add(new CanonConflictSubject
            {
                ConflictId = conflict.Id,
                SubjectKind = subject.Kind,
                SubjectId = subject.SubjectId,
                Role = subject.Role,
            });
            changed = true;
        }

        return changed;
    }
}
