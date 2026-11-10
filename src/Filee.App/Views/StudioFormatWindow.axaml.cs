using Avalonia.Controls;
using Avalonia.Interactivity;
using Filee.Core.Conversion;
using Filee.Core.Formats;
using Filee.Core.Localization;

namespace Filee.App.Views;

public partial class StudioFormatWindow : Window
{
    private readonly IReadOnlyList<FileFormat> _formats;
    private readonly ILocalizer _localizer;
    private readonly string? _error;

    public StudioFormatWindow(IReadOnlyList<FileFormat> formats, int fileCount, ILocalizer localizer, string? error = null)
    {
        _formats = formats;
        _localizer = localizer;
        _error = error;

        InitializeComponent();
        BatchSummary.Text = localizer.Format("studio.picker_count", fileCount);
        FormatSearch.IsEnabled = formats.Count > 0;
        FormatSearch.TextChanged += (_, _) => Filter();
        FormatResults.SelectionChanged += (_, _) => ConvertBatch.IsEnabled = FormatResults.SelectedItem is FileFormat;
        Opened += (_, _) => FormatSearch.Focus();
        Filter();
    }

    internal static IReadOnlyList<FileFormat> TargetsFor(IReadOnlyList<string> paths, ConverterCatalog catalog)
    {
        var inputFormats = paths.Select(path => FormatRegistry.Detect(path)?.Id).Distinct().ToArray();
        if (inputFormats.Length == 0 || inputFormats.Any(format => format is null) || paths.Any(path => !File.Exists(path)))
            return [];

        var planner = catalog.CreatePlanner();
        return FormatRegistry.Known
            .Where(target => target.Writable && inputFormats.All(source =>
                source is not null && source != target.Id && planner.Plan(source, target.Id) is not null))
            .OrderBy(format => format.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
    }

    private void Filter()
    {
        var query = (FormatSearch.Text ?? "").Trim().TrimStart('.');
        var matches = _formats.Where(format =>
            format.DisplayName.Contains(query, StringComparison.CurrentCultureIgnoreCase) ||
            format.Extensions.Any(extension => extension.Contains(query, StringComparison.OrdinalIgnoreCase))).ToArray();
        var previous = FormatResults.SelectedItem as FileFormat;
        FormatResults.ItemsSource = matches;
        FormatResults.SelectedItem = previous is not null && matches.Contains(previous) ? previous : null;
        FormatResults.IsVisible = matches.Length > 0;
        EmptyState.IsVisible = matches.Length == 0;
        EmptyState.Text = _error ?? _localizer[_formats.Count == 0 ? "studio.picker_empty" : "studio.picker_no_matches"];
        ConvertBatch.IsEnabled = FormatResults.SelectedItem is FileFormat;
    }

    private void OnConvert(object? sender, RoutedEventArgs e)
    {
        if (FormatResults.SelectedItem is FileFormat selected)
            Close(selected);
    }

    private void OnCancel(object? sender, RoutedEventArgs e) => Close();
}
