using Lorex.Api.Features.CanonIntegrity.Rules;

namespace Lorex.Api.Features.CanonIntegrity;

/// <summary>
/// The registered rule set. A rule is live once it is listed here and nowhere else, so the
/// production checks are one readable list rather than an assembly scan that quietly picks
/// up whatever happens to implement the interface.
/// </summary>
public static class CanonIntegritySetup
{
    public static IServiceCollection AddCanonIntegrity(this IServiceCollection services)
    {
        services.AddScoped<ICanonIntegrityRule, CanonRelationshipEntityStatusRule>();
        services.AddScoped<ICanonIntegrityRule, CanonTimelineEntityStatusRule>();
        services.AddScoped<ICanonIntegrityRule, CanonEntityReferenceStatusRule>();

        services.AddScoped<CanonIntegrityEvaluator>();

        return services;
    }
}
