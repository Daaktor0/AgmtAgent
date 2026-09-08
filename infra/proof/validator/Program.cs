using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

internal static class Program
{
    private const string Version = "proof-sdk-validator-v1";
    private const string Target = "Office2016";

    public static int Main(string[] args)
    {
        try
        {
            var parsed = Parse(args);
            Console.WriteLine(JsonSerializer.Serialize(Validate(parsed)));
            return 0;
        }
        catch
        {
            Console.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["version"] = Version,
                ["valid"] = false,
                ["code"] = "invalid_package",
                ["errorCount"] = 0,
                ["sourceSha256"] = "0".PadRight(64, '0'),
                ["outputSha256"] = "0".PadRight(64, '0'),
                ["target"] = Target,
            }));
            return 2;
        }
    }

    private static Dictionary<string, string> Parse(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 0; i < args.Length; i += 2)
        {
            if (i + 1 >= args.Length || !args[i].StartsWith("--", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("invalid_args");
            }
            values[args[i][2..]] = args[i + 1];
        }
        return values;
    }

    private static Dictionary<string, object?> Validate(Dictionary<string, string> args)
    {
        var sourcePath = args["source"];
        var outputPath = args["output"];
        var sourceSha = RequireSha(args["source-sha256"]);
        var outputSha = RequireSha(args["output-sha256"]);
        if (!string.Equals(args.GetValueOrDefault("target", Target), Target, StringComparison.Ordinal))
        {
            return Result(false, "invalid_package", 0, sourceSha, outputSha);
        }
        if (Unsupported(sourcePath) || Unsupported(outputPath))
        {
            return Result(false, "unsupported_extension", 0, sourceSha, outputSha);
        }

        var sourceBytes = File.ReadAllBytes(sourcePath);
        var outputBytes = File.ReadAllBytes(outputPath);
        if (Sha256(sourceBytes) != sourceSha || Sha256(outputBytes) != outputSha)
        {
            return Result(false, "hash_mismatch", 0, sourceSha, outputSha);
        }

        var sourceCount = CountErrors(sourceBytes);
        var outputCount = CountErrors(outputBytes);
        if (sourceCount < 0 || outputCount < 0)
        {
            return Result(false, "invalid_package", 0, sourceSha, outputSha);
        }
        var total = sourceCount + outputCount;
        return Result(total == 0, total == 0 ? "ok" : "schema_errors", total, sourceSha, outputSha);
    }

    private static int CountErrors(byte[] bytes)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var document = WordprocessingDocument.Open(stream, false);
            var validator = new OpenXmlValidator(FileFormatVersions.Office2016);
            return validator.Validate(document).Count();
        }
        catch
        {
            return -1;
        }
    }

    private static bool Unsupported(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".doc" or ".docm" or ".dotx" or ".dotm" or ".pdf";
    }

    private static string RequireSha(string value)
    {
        if (value.Length != 64 || value.Any(ch => ch is < '0' or > '9' and < 'a' or > 'f'))
        {
            throw new InvalidOperationException("hash");
        }
        return value;
    }

    private static string Sha256(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static Dictionary<string, object?> Result(bool valid, string code, int errorCount, string sourceSha, string outputSha)
    {
        return new Dictionary<string, object?>
        {
            ["version"] = Version,
            ["valid"] = valid,
            ["code"] = code,
            ["errorCount"] = errorCount,
            ["sourceSha256"] = sourceSha,
            ["outputSha256"] = outputSha,
            ["target"] = Target,
        };
    }
}
