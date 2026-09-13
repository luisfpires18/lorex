using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Lorex.Api.Tests;

/// <summary>
/// Counts the database commands EF Core runs that carry one of the given ids as a parameter. Other test
/// classes run in parallel in the same process, and none of their commands carries this test's ids.
///
/// Shared by every read that promises a fixed number of queries - the story read and the plot read - so the
/// promise is held to the same measure everywhere.
/// </summary>
internal sealed class CommandCounter : IObserver<DiagnosticListener>, IObserver<KeyValuePair<string, object?>>, IDisposable
{
    private readonly string[] _keys;
    private readonly List<IDisposable> _subscriptions = [];
    private int _count;

    public CommandCounter(IReadOnlyCollection<Guid> ids)
    {
        _keys = [.. ids.Select(id => id.ToString())];
        var all = DiagnosticListener.AllListeners.Subscribe(this);

        lock (_subscriptions)
        {
            _subscriptions.Add(all);
        }
    }

    public int Count => _count;

    /// <summary>Runs <paramref name="work"/> and counts the commands it caused that name any of <paramref name="ids"/>.</summary>
    public static async Task<(int Queries, T Result)> CountAsync<T>(IReadOnlyCollection<Guid> ids, Func<Task<T>> work)
    {
        using var counter = new CommandCounter(ids);
        var result = await work();
        return (counter.Count, result);
    }

    public void OnNext(DiagnosticListener value)
    {
        if (value.Name == DbLoggerCategory.Name)
        {
            lock (_subscriptions)
            {
                _subscriptions.Add(value.Subscribe(this));
            }
        }
    }

    public void OnNext(KeyValuePair<string, object?> value)
    {
        if (value.Key != RelationalEventId.CommandExecuted.Name || value.Value is not CommandExecutedEventData executed)
        {
            return;
        }

        var carriesId = executed.Command.Parameters
            .Cast<DbParameter>()
            .Any(parameter => parameter.Value?.ToString() is { } text
                && _keys.Any(key => text.Contains(key, StringComparison.OrdinalIgnoreCase)));

        if (carriesId)
        {
            Interlocked.Increment(ref _count);
        }
    }

    public void OnCompleted()
    {
    }

    public void OnError(Exception error)
    {
    }

    public void Dispose()
    {
        lock (_subscriptions)
        {
            foreach (var subscription in _subscriptions)
            {
                subscription.Dispose();
            }

            _subscriptions.Clear();
        }
    }
}
