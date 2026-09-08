namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon entity that dies before it is born.
///
/// The first rule that reads what a field *means* rather than how the model links records.
/// Both years have to be declared through <see cref="Lore.EntityFieldSemantic"/>; an entity
/// whose author never said which field is the birth year is invisible to this rule, which
/// is the point - meaning is declared, never guessed from a name.
///
/// High, because it is not a matter of taste or of lore that is not settled yet: the two
/// facts cannot both be true, whatever the calendar.
///
/// The boundary is deliberately not an error. Birth year equal to death year is an infant
/// death, which is ordinary lore, so only a strictly later birth is reported.
/// </summary>
public sealed class CanonLifespanOrderRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-LIFE-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.High;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var lifespans = await CanonLifespanReader.LoadLifespansAsync(context, cancellationToken);

        return
        [
            .. lifespans.Values
                .Where(lifespan => lifespan is { Birth: not null, Death: not null }
                    && lifespan.Birth.Year > lifespan.Death.Year)
                .OrderBy(lifespan => lifespan.EntityId)
                .Select(Finding),
        ];
    }

    private CanonFinding Finding(CanonLifespan lifespan)
    {
        var birth = lifespan.Birth!;
        var death = lifespan.Death!;
        var name = CanonRuleText.Quoted(lifespan.EntityName);

        var title =
            $"{name} is born in {CanonLifespanReader.Year(birth.Year)} but dies in " +
            $"{CanonLifespanReader.Year(death.Year)}";

        var explanation =
            $"{name} is marked Canon. Its {birth.FieldName} field gives the year " +
            $"{CanonLifespanReader.Year(birth.Year)} and its {death.FieldName} field gives " +
            $"{CanonLifespanReader.Year(death.Year)}, so it dies before it is born. One of the two " +
            "years is wrong. Correct whichever it is, or clear it.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The entity and the two fields that disagree - never the years themselves.
            // Correcting 3441 to 2441 leaves the same conflict to reword or resolve, while
            // moving the meaning to a different field is a different fact and a new one.
            CanonFingerprint.From(
                RuleCode,
                CanonFingerprint.Id(lifespan.EntityId),
                CanonFingerprint.Id(birth.FieldDefinitionId),
                CanonFingerprint.Id(death.FieldDefinitionId)),
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Entity, lifespan.EntityId, "entity"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, birth.FieldDefinitionId, "birth"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, death.FieldDefinitionId, "death"),
            ]);
    }
}
