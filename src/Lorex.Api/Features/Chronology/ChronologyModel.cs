using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Chronology;

/// <summary>
/// Which way an era's years run. Configured by the author, never read out of the era's name:
/// an era called "Before the Fall" counts down only because someone said it does, and a
/// language with no word for "before" loses nothing.
/// </summary>
public enum ChronologyEraDirection
{
    /// <summary>Years count up from 1, so year 1 is the era's earliest: "AF 1, AF 2, AF 3".</summary>
    Ascending = 0,

    /// <summary>
    /// Years count down to 1, so year 1 is the era's latest - the one nearest whatever era comes
    /// next: "BF 3, BF 2, BF 1".
    /// </summary>
    Descending = 1,
}

/// <summary>Where an era's label is written beside a year. Display only; it never orders anything.</summary>
public enum ChronologyLabelPosition
{
    /// <summary>"BF 10".</summary>
    BeforeYear = 0,

    /// <summary>"10 BF".</summary>
    AfterYear = 1,
}

/// <summary>
/// One era of a universe's reckoning: a named stretch of time with a place in the order and a
/// direction its years run in.
///
/// Eras are the universe's configuration, not labels on the records that use them. A timeline
/// entry or a birth year points at an era by id, so renaming "After the Fall" rewords every
/// date written in it and moves none of them, and two eras can never be confused because they
/// happen to share a name.
///
/// A universe with no eras keeps plain signed years, exactly as Lorex always has. See
/// <c>docs/architecture/decisions/0022-universe-chronology.md</c>.
/// </summary>
public sealed class ChronologyEra
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>"Before the Fall". Unique within the universe, ignoring case.</summary>
    public required string Name { get; set; }

    /// <summary>"BF", or null to write the full name beside a year instead.</summary>
    public string? Abbreviation { get; set; }

    /// <summary>
    /// The era's place in the order, 0 first. Contiguous and unique per universe: the one route
    /// that writes it assigns it from the position the author put the era in.
    /// </summary>
    public int SortOrder { get; set; }

    public ChronologyEraDirection Direction { get; set; }

    public ChronologyLabelPosition LabelPosition { get; set; }
}
