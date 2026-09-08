using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Lorex.Api.Data;

namespace Lorex.Api.Features.CanonIntegrity;

/// <summary>
/// Everything a rule is given: the context, and the one universe it may look at. A rule
/// that reads outside <see cref="UniverseId"/> is a bug, not a feature.
/// </summary>
public sealed record CanonRuleContext(LorexDbContext Db, Guid UniverseId);

/// <summary>One record a finding is about, and the part it plays in it.</summary>
public sealed record CanonFindingSubject(CanonSubjectKind Kind, Guid SubjectId, string Role);

/// <summary>
/// One problem a rule detected on one evaluation. Findings are values, not rows: the
/// evaluator decides what to store. Two runs over unchanged lore must produce findings
/// with identical fingerprints, or evaluation stops being idempotent.
/// </summary>
public sealed record CanonFinding(
    string RuleCode,
    CanonConflictSeverity Severity,
    string Fingerprint,
    string Title,
    string Explanation,
    IReadOnlyList<CanonFindingSubject> Subjects);

/// <summary>
/// A deterministic check over one universe's lore.
///
/// Rules are ordinary C# classes, not a DSL and not configuration. Each one answers a
/// single question, reports what it found, and changes nothing: detection and persistence
/// are kept apart so a rule can be read and tested on its own.
/// </summary>
public interface ICanonIntegrityRule
{
    /// <summary>
    /// Stable across releases. It is written into every conflict this rule opens, so
    /// changing it orphans the conflicts already recorded under the old code.
    /// </summary>
    string RuleCode { get; }

    /// <summary>The severity every finding from this rule carries.</summary>
    CanonConflictSeverity Severity { get; }

    /// <summary>
    /// Returns every problem found in this universe, or an empty list. Must not write.
    /// </summary>
    Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken);
}

/// <summary>
/// Turns the ids a finding is about into the stable key that identifies it across runs.
///
/// A cryptographic hash rather than <c>GetHashCode</c>, which is randomized per process
/// and would give the same problem a different key after every restart. Only ids and the
/// rule code go in - never a name or a wording - so renaming a character refreshes a
/// conflict's text instead of opening a second one.
/// </summary>
public static class CanonFingerprint
{
    /// <summary>Unit separator: cannot appear in an id, so parts never run together.</summary>
    private const char Separator = '\u001f';

    public static string From(string ruleCode, params ReadOnlySpan<string> parts)
    {
        var builder = new StringBuilder(ruleCode);

        foreach (var part in parts)
        {
            builder.Append(Separator).Append(part);
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()));
        return Convert.ToHexStringLower(hash);
    }

    /// <summary>Guids in one invariant form, so the hash never depends on formatting.</summary>
    public static string Id(Guid id) => id.ToString("N", CultureInfo.InvariantCulture);
}
