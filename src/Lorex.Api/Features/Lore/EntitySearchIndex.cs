using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// One row of the full-text index: the entry it points at, and how well it matched.
/// Keyless and never migrated - it exists only so the FTS5 query below can be composed into
/// the ordinary entity listing instead of being run apart from it.
/// </summary>
public sealed class EntitySearchMatch
{
    public Guid EntityId { get; set; }

    /// <summary>
    /// The BM25 score, which FTS5 returns negative: the better the match, the smaller the
    /// number. Ordered ascending, therefore, and never shown to the author.
    /// </summary>
    public double Rank { get; set; }
}

/// <summary>
/// The SQLite FTS5 index behind entity search, and the only place in the codebase that knows
/// full text is done by FTS5 at all. Everything outside talks to
/// <see cref="ReindexAsync"/>, <see cref="Match"/> and <see cref="BuildMatchExpression"/>.
///
/// Deliberately **not** an abstraction over "search". PostgreSQL will not do any of this the
/// same way, and a shared interface would only make the eventual second implementation harder
/// to see. When PostgreSQL arrives this file is replaced, not implemented twice. See
/// <c>docs/architecture/decisions/0016-sqlite-full-text-search.md</c>.
///
/// The index is a managed FTS5 table - one ordinary content-carrying row per entry, keyed by an
/// UNINDEXED <c>EntityId</c> column. Not external-content and not contentless: external content
/// needs an INTEGER rowid to point back at, and an entry is keyed by a Guid; contentless tables
/// need version-dependent tricks to delete a row. A managed table costs a second copy of the
/// text and buys a delete that is one plain statement on every SQLite that has FTS5 at all.
///
/// The index stores no lifecycle state. Whether an entry is trashed, archived or in another
/// universe is answered by joining back to <c>Entities</c>, which is where those columns already
/// live - so trashing an entry, restoring it or filtering the browse never touches the index and
/// cannot disagree with it.
///
/// The table and the trigger that empties it are created by the <c>AddEntitySearchIndex</c>
/// migration, which is where the column order, the tokenizer and the prefix settings are
/// written down. Nothing here creates them: a migration is a frozen record, and reading it
/// second-hand from a constant this file could later change would make it a lie.
/// </summary>
public static class EntitySearchIndex
{
    /// <summary>Longer input than any real query, truncated before tokenizing.</summary>
    private const int MaxSearchLength = 200;

    /// <summary>More words than any real query. Extra ones are dropped, not an error.</summary>
    private const int MaxSearchTokens = 16;

    /// <summary>How many words of an article an excerpt holds, around the match. FTS5 allows up to 64.</summary>
    private const int ExcerptWords = 16;

    /// <summary>
    /// The most characters an excerpt carries, whatever the words are. A word is whatever the tokenizer says, and a long
    /// run of letters with no break is one word, so the count of words alone does not bound the payload.
    /// </summary>
    private const int MaxExcerptLength = 240;

    /// <summary>
    /// Where a matched word starts and ends in FTS5's excerpt. Private-use characters, so they are read as markers and
    /// never shown; the client is sent runs of text, never markup.
    /// </summary>
    private const char MatchOpen = '';

    private const char MatchClose = '';

    /// <summary>
    /// Rewrites one entry's index row from what is now stored, inside the caller's transaction.
    /// Called by the write paths that can change indexed text - creating an entry, the single
    /// update path every structured edit and every revision restore goes through, and the
    /// article's save and restore - so a refused write takes its index row down with it and a
    /// committed one cannot be missing.
    ///
    /// Delete-then-insert rather than an update, because the row may not exist yet and FTS5 has
    /// no upsert. An entry that is gone by the time this runs leaves no row behind.
    /// </summary>
    public static async Task ReindexAsync(
        LorexDbContext db,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var entry = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == entityId)
            .Select(entity => new
            {
                entity.Name,
                entity.Summary,
                Aliases = entity.Aliases.Select(alias => alias.Value).ToList(),
                Article = db.EntityArticles
                    .Where(article => article.EntityId == entity.Id)
                    .Select(article => article.Content)
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        await db.Database.ExecuteSqlAsync(
            $"DELETE FROM EntitySearchIndex WHERE EntityId = {entityId}",
            cancellationToken);

        if (entry is null)
        {
            return;
        }

        // Aliases are joined by a newline rather than a space: the tokenizer treats both as a
        // separator, and one alias per line is what a stored row should look like when read.
        var aliases = string.Join('\n', entry.Aliases);
        var article = LoreArticleText.Extract(entry.Article);

        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO EntitySearchIndex (EntityId, Name, Aliases, Summary, Article)
            VALUES ({entityId}, {entry.Name}, {aliases}, {entry.Summary ?? string.Empty}, {article})
            """,
            cancellationToken);
    }

    /// <summary>
    /// Indexes every entry that has no row yet, and returns how many it wrote.
    ///
    /// This is the backfill and the rebuild both. Entries written before the index existed have
    /// no row, so the first run after the migration indexes the whole universe set; a later
    /// change to what is indexed or how text is extracted ships a migration that empties the
    /// table, and the next start fills it again. Idempotent, so running it on every start costs
    /// one query when there is nothing to do.
    ///
    /// Never left to the author. An index nobody rebuilt is an index that lies.
    /// </summary>
    public static async Task<int> BackfillAsync(LorexDbContext db, CancellationToken cancellationToken)
    {
        var missing = await db.Database
            .SqlQuery<Guid>(
                $"""
                SELECT Id AS Value FROM Entities
                WHERE Id NOT IN (SELECT EntityId FROM EntitySearchIndex)
                """)
            .ToListAsync(cancellationToken);

        foreach (var entityId in missing)
        {
            await ReindexAsync(db, entityId, cancellationToken);
        }

        return missing.Count;
    }

    /// <summary>
    /// The matching rows, scored, as a query the entity listing can join to. Composable on
    /// purpose: ownership, the Trash, archiving, the type and tag filters and paging all stay
    /// where they already are, and full text becomes one more join rather than a second
    /// endpoint.
    ///
    /// The BM25 weights are per column, in declaration order. A name is what an entry is called
    /// and an article is only where it is mentioned, so a name match outranks a body match; the
    /// UNINDEXED key column can never match and carries no weight. These four numbers are the
    /// whole ranking system, on purpose.
    /// </summary>
    public static IQueryable<EntitySearchMatch> Match(LorexDbContext db, string expression) =>
        db.Set<EntitySearchMatch>().FromSql(
            $"""
            SELECT EntityId, bm25(EntitySearchIndex, 0.0, 10.0, 6.0, 3.0, 1.0) AS Rank
            FROM EntitySearchIndex
            WHERE EntitySearchIndex MATCH {expression}
            """);

    /// <summary>
    /// For one page of search results, the few words of each article around what matched, by entry. An entry whose article
    /// did not match - found by its name, an alias or its summary - has none.
    ///
    /// FTS5's <c>snippet</c> cuts the words from the indexed text - the prose <see cref="LoreArticleText"/> extracted, never
    /// the document - so no article is read, and the ids bound the work to the page already chosen. Column 4 is
    /// <c>Article</c>, in the migration's column order. The result is plain runs of text; nothing in it is markup.
    /// </summary>
    public static async Task<Dictionary<Guid, IReadOnlyList<SearchExcerptPart>>> ArticleExcerptsAsync(
        LorexDbContext db,
        string expression,
        IReadOnlyList<Guid> entityIds,
        CancellationToken cancellationToken)
    {
        var excerpts = new Dictionary<Guid, IReadOnlyList<SearchExcerptPart>>();

        if (entityIds.Count == 0)
        {
            return excerpts;
        }

        // Every value is a parameter: {0} the expression, {1}.. the page's ids. Only the placeholders are composed.
        var placeholders = string.Join(
            ", ",
            entityIds.Select((_, index) => "{" + (index + 1).ToString(CultureInfo.InvariantCulture) + "}"));

        var sql =
            "SELECT EntityId, snippet(EntitySearchIndex, 4, char(57344), char(57345), '…', "
            + ExcerptWords.ToString(CultureInfo.InvariantCulture)
            + ") AS Excerpt FROM EntitySearchIndex WHERE EntitySearchIndex MATCH {0} AND EntityId IN ("
            + placeholders
            + ")";

        object[] arguments = [expression, .. entityIds.Cast<object>()];

        var rows = await db.Database
            .SqlQuery<ExcerptRow>(FormattableStringFactory.Create(sql, arguments))
            .ToListAsync(cancellationToken);

        foreach (var row in rows)
        {
            if (ParseExcerpt(row.Excerpt) is { } parts)
            {
                excerpts[row.EntityId] = parts;
            }
        }

        return excerpts;
    }

    /// <summary>
    /// FTS5's excerpt as runs of text, the matched ones marked, at most <see cref="MaxExcerptLength"/> characters. Null when
    /// nothing in it matched: FTS5 still returns the article's opening words for an entry that matched elsewhere, and
    /// showing those as a match would say something untrue.
    /// </summary>
    internal static IReadOnlyList<SearchExcerptPart>? ParseExcerpt(string? excerpt)
    {
        if (string.IsNullOrEmpty(excerpt) || !excerpt.Contains(MatchOpen))
        {
            return null;
        }

        var parts = new List<SearchExcerptPart>();
        var run = new StringBuilder();
        var isMatch = false;
        var length = 0;

        foreach (var character in excerpt)
        {
            if (character is MatchOpen or MatchClose)
            {
                Flush();
                isMatch = character == MatchOpen;
                continue;
            }

            // Cut before a character, never between the halves of one.
            if (length >= MaxExcerptLength && !char.IsLowSurrogate(character))
            {
                Flush();
                isMatch = false;
                run.Append('…');
                break;
            }

            run.Append(character);
            length++;
        }

        Flush();

        return parts.Exists(part => part.IsMatch) ? parts : null;

        void Flush()
        {
            if (run.Length > 0)
            {
                parts.Add(new SearchExcerptPart(run.ToString(), isMatch));
                run.Clear();
            }
        }
    }

    /// <summary>One row of <see cref="ArticleExcerptsAsync"/>'s query. Read through raw SQL; mapped to no table.</summary>
    private sealed class ExcerptRow
    {
        public Guid EntityId { get; set; }

        public string? Excerpt { get; set; }
    }

    /// <summary>
    /// Turns what the author typed into an FTS5 expression, or null when there is nothing to
    /// match on.
    ///
    /// Nothing the author types is ever FTS5 syntax. The input is split into words on anything
    /// that is not a letter or a digit - which is what the <c>unicode61</c> tokenizer does to
    /// the indexed text - and every word is re-emitted quoted, so a quote, a bare <c>*</c>, an
    /// unbalanced bracket, a <c>NEAR</c> or a column filter is a word to search for and never a
    /// query to run. That is the whole defence against a 500 from a punctuation-only search box.
    ///
    /// Words are ANDed: more words means fewer results, which is what typing more words is for.
    /// The last one is matched as a prefix because the search box fires while the author is
    /// still typing it, and a query that only matched whole words would show nothing until the
    /// final keystroke. Earlier words are matched whole, so "war" does not quietly become
    /// "warden" once another word follows it.
    ///
    /// Returns null when the input holds no letter or digit at all - a search for "%" or "???"
    /// finds nothing, exactly as it found nothing before.
    /// </summary>
    public static string? BuildMatchExpression(string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
        {
            return null;
        }

        var input = search.Length > MaxSearchLength ? search[..MaxSearchLength] : search;
        var tokens = new List<string>();
        var word = new StringBuilder();

        foreach (var character in input)
        {
            if (char.IsLetterOrDigit(character))
            {
                word.Append(character);
                continue;
            }

            if (word.Length > 0)
            {
                tokens.Add(word.ToString());
                word.Clear();
            }

            if (tokens.Count == MaxSearchTokens)
            {
                break;
            }
        }

        if (word.Length > 0 && tokens.Count < MaxSearchTokens)
        {
            tokens.Add(word.ToString());
        }

        if (tokens.Count == 0)
        {
            return null;
        }

        var builder = new StringBuilder();

        for (var index = 0; index < tokens.Count; index++)
        {
            if (index > 0)
            {
                builder.Append(" AND ");
            }

            builder.Append('"').Append(tokens[index]).Append('"');

            if (index == tokens.Count - 1)
            {
                builder.Append('*');
            }
        }

        return builder.ToString();
    }
}

/// <summary>
/// The scored row is read through raw SQL over a virtual table, so it is mapped to no table and
/// no view and produces no migration. The FTS5 table itself is created by
/// <c>AddEntitySearchIndex</c>, which EF Core's model knows nothing about.
/// </summary>
public sealed class EntitySearchMatchConfiguration : IEntityTypeConfiguration<EntitySearchMatch>
{
    public void Configure(EntityTypeBuilder<EntitySearchMatch> builder)
    {
        builder.HasNoKey();
        builder.ToView(null);
    }
}
