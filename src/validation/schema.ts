import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { schemaDiagnostic, type Diagnostic } from "../errors.js";
import { suggestRepairsFromAjvErrors } from "../repair/suggestions.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });

const schemaCache = new Map<string, object>();

export async function loadSchema(templateDir: string): Promise<object> {
  const cached = schemaCache.get(templateDir);
  if (cached) return cached;
  const raw = await readFile(path.join(templateDir, "schema.json"), "utf8");
  const schema = JSON.parse(raw) as object;
  schemaCache.set(templateDir, schema);
  return schema;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return "Data does not match template schema.";
  return errors
    .map((e) => {
      const field = e.instancePath || e.params?.missingProperty || "(root)";
      return `${field}: ${e.message ?? "invalid"}`;
    })
    .join("; ");
}

export function validateData(
  schema: object,
  data: unknown,
): { ok: true } | { ok: false; diagnostic: Diagnostic; missing_fields: string[] } {
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (ok) return { ok: true };

  const missing = (validate.errors ?? [])
    .filter((e: ErrorObject) => e.keyword === "required")
    .map((e: ErrorObject) => String(e.params?.missingProperty ?? ""))
    .filter(Boolean);

  const message = formatAjvErrors(validate.errors);
  const suggested_repairs = suggestRepairsFromAjvErrors(validate.errors);
  return {
    ok: false,
    missing_fields: missing,
    diagnostic: schemaDiagnostic(`Schema validation failed: ${message}`, {
      agent_action:
        missing.length > 0
          ? `Add required fields: ${missing.join(", ")}`
          : "Correct field types and required properties per get_template_schema.",
      location: { path: validate.errors?.[0]?.instancePath },
      repair_available: suggested_repairs.length > 0,
      suggested_repairs: suggested_repairs.length > 0 ? suggested_repairs : undefined,
    }),
  };
}
