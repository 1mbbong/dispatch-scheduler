import { z } from "zod";

const schema = z.object({
  joinYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
});

console.log("Testing null:", schema.safeParse({ joinYear: null }));
console.log("Testing empty string:", schema.safeParse({ joinYear: "" }));
console.log("Testing undefined:", schema.safeParse({ joinYear: undefined }));
console.log("Testing valid year:", schema.safeParse({ joinYear: 2024 }));
