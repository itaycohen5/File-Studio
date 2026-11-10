# FILE Studio

FILE Studio is a desktop workspace for converting files locally. Drop or browse for files, review the batch, then search for an output format compatible with the whole selection. Finished jobs appear in the conversion history.

- **Workspace:** a file queue, searchable output formats and batch conversion.
- **Presets and tools:** open the advanced menu from the queue to access format-specific options, including tools such as PDF operations.
- **Engines:** available conversions depend on the input and installed engines. Some formats require an optional download from Settings.
- **Output:** the workspace uses the default output location in Settings and renames output files on name conflicts.

## Run from source

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0), then run this from the repository root:

```sh
dotnet run --project src/Filee.App/Filee.App.csproj
```

The application uses a separate `FileStudio` settings directory under the operating system's application-data directory. To run with a temporary settings directory, set `FILEE_DATA_DIR` before launching. This repository provides a source build; upstream installers and release workflows belong to the upstream project.

## Credits

FILE Studio's workspace, visual identity and format-selection flow are maintained by Itay Cohen. It builds on [Filee](https://github.com/KnifeLemon/Filee) by Myeonggu Kim (KnifeLemon) and contributors, including its conversion engines, format routing, queue, presets and platform support. The upstream history remains in this repository.

See the [MIT license](LICENSE) and [third-party notices](THIRD-PARTY-NOTICES.md).
