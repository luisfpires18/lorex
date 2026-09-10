namespace Lorex.Api.Features.Lore;

public static class EntityImageLimits
{
    /// <summary>Comfortably longer than the convention below can ever produce.</summary>
    public const int ObjectKeyMaxLength = 400;

    public const int ContentTypeMaxLength = 100;

    public const int FileNameMaxLength = 255;
}

/// <summary>
/// Where an entry's image lives in the bucket.
///
///   universes/{universeId}/entities/{entityId}/primary/{assetId}/original.{ext}
///   universes/{universeId}/entities/{entityId}/primary/{assetId}/thumbnail.webp
///
/// R2 has no folders; a key is one flat string and the slashes are only a prefix the console
/// happens to draw as a tree. So this layout buys exactly two things - a prefix that scopes an
/// entry's objects together, and an <c>{assetId}</c> segment that makes every upload a
/// different path.
///
/// Ids only. No username, no email, no universe name, no entry name. A bucket listing is a
/// disclosure surface even on a private bucket, and none of those belong in one: names are
/// authored content, and an id is not. It also means renaming a world or a character moves
/// nothing.
///
/// <c>{assetId}</c> is new for every upload, replacements included. Nothing is ever written
/// over the pair that is currently live, which is what lets a replacement fail without taking
/// the working image with it - and what makes a served URL immutable enough to cache.
/// </summary>
public static class EntityImageKeys
{
    public static string Prefix(Guid universeId, Guid entityId, Guid assetId) =>
        $"universes/{universeId:D}/entities/{entityId:D}/primary/{assetId:D}";

    public static string Original(Guid universeId, Guid entityId, Guid assetId, string extension) =>
        $"{Prefix(universeId, entityId, assetId)}/original.{extension}";

    public static string Thumbnail(Guid universeId, Guid entityId, Guid assetId) =>
        $"{Prefix(universeId, entityId, assetId)}/thumbnail.webp";
}
