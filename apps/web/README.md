bash -lc '
set -e

APP="zoeskoul-edu"

rm -rf "$APP"

npx create-next-app@latest "$APP" --ts --tailwind --eslint --app --src-dir --import-alias "@/*"

cd "$APP"

# deps you likely need (adjust as you like)
npm i @prisma/client pg
npm i -D prisma tsx

# ---------------------------
# Directories
# ---------------------------
mkdir -p \
  src/app/"(public)"/"[locale]"/practice \
  src/app/"(public)"/"[locale]"/subjects/"[subjectSlug]"/modules/"[moduleSlug]" /practice\
  src/app/api/practice \
  src/app/api/catalog/subjects \
  src/app/api/catalog/topics \
  src/lib/practice/catalog \
  src/lib/practice/db \
  src/lib/practice/generator/engines \
  src/lib/practice/generator/shared \
  src/components/practice/ExerciseRenderer \
  src/components/subjects/python \
  src/components/subjects/linear-algebra \
  prisma/seed/data/subjects/linear-algebra \
  prisma/seed/data/subjects/python

# ---------------------------
# App routes (stubs)
# ---------------------------
cat > src/app/"(public)"/"[locale]"/practice/page.tsx << "EOF"
export default function PracticePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Practice</h1>
      <p>Practice shell goes here.</p>
    </main>
  );
}
EOF

cat > src/app/"(public)"/"[locale]"/subjects/"[subjectSlug]"/page.tsx << "EOF"
export default function SubjectLanding() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Subject</h1>
      <p>Subject landing (optional)</p>
    </main>
  );
}
EOF

cat > src/app/"(public)"/"[locale]"/subjects/"[subjectSlug]"/modules/"[moduleSlug]"/page.tsx << "EOF"
export default function ModuleLanding() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Module</h1>
      <p>Module landing (optional)</p>
    </main>
  );
}
EOF

# ---------------------------
# API routes (stubs)
# ---------------------------
cat > src/app/api/practice/route.ts << "EOF"
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "TODO: implement /api/practice" }, { status: 200 });
}
EOF

cat > src/app/api/catalog/subjects/route.ts << "EOF"
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "TODO: implement /api/catalog/subjects" }, { status: 200 });
}
EOF

cat > src/app/api/catalog/topics/route.ts << "EOF"
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "TODO: implement /api/catalog/topics" }, { status: 200 });
}
EOF

# ---------------------------
# lib/prisma.ts (stub)
# ---------------------------
cat > src/lib/prisma.ts << "EOF"
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF

# ---------------------------
# Practice lib (stubs)
# ---------------------------
cat > src/lib/practice/types.ts << "EOF"
export type Difficulty = "easy" | "medium" | "hard";
export type GenKey = string;
export type TopicSlug = string;

export type Exercise =
  | { kind: "numeric"; id: string; topic: TopicSlug; difficulty: Difficulty; title: string; prompt: string; hint?: string; tolerance?: number }
  | { kind: "single_choice"; id: string; topic: TopicSlug; difficulty: Difficulty; title: string; prompt: string; options: { id: string; text: string }[]; hint?: string };
EOF

cat > src/lib/practice/actor.ts << "EOF"
export type Actor = { userId: string | null; guestId: string | null };

export async function getActor(): Promise<Actor> {
  return { userId: null, guestId: null };
}

export function ensureGuestId(actor: Actor) {
  return { actor: { ...actor, guestId: actor.guestId ?? "guest" }, setGuestId: actor.guestId ? undefined : "guest" };
}

export function attachGuestCookie(res: any, _setGuestId?: string) {
  return res;
}
EOF

cat > src/lib/practice/key.ts << "EOF"
export function signPracticeKey(_args: any) {
  return "signed_key_placeholder";
}
EOF

cat > src/lib/practice/catalog/index.ts << "EOF"
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
EOF

cat > src/lib/practice/topicSlugs.ts << "EOF"
export function toDbTopicSlug(input: string) {
  return String(input ?? "").trim();
}

export function genKeyFromAnySlug(_slug: string): string | null {
  return null;
}
EOF

mkdir -p src/lib/practice/db
cat > src/lib/practice/db/subjects.ts << "EOF"
export async function listSubjectsFromDb() {
  return [];
}
EOF

cat > src/lib/practice/db/topics.ts << "EOF"
export async function resolveTopicFromScope(_slug: string) {
  return null;
}
EOF

# ---------------------------
# Generator (stubs)
# ---------------------------
cat > src/lib/practice/generator/index.ts << "EOF"
import type { Difficulty, GenKey } from "../types";

export async function getExerciseWithExpected(_genKey: GenKey, _difficulty: Difficulty, _opt?: { variant?: string }) {
  return { exercise: null, expected: null };
}
EOF

cat > src/lib/practice/generator/registry.ts << "EOF"
export const TOPIC_GENERATORS: Record<string, any> = {};
EOF

cat > src/lib/practice/generator/engines/matrices_part1.ts << "EOF"
export {};
EOF

cat > src/lib/practice/generator/engines/matrices_part2.ts << "EOF"
export {};
EOF

cat > src/lib/practice/generator/engines/python_part1.ts << "EOF"
export {};
EOF

cat > src/lib/practice/generator/shared/rng.ts << "EOF"
export {};
EOF

cat > src/lib/practice/generator/shared/expected.ts << "EOF"
export {};
EOF

cat > src/lib/practice/generator/shared/utils.ts << "EOF"
export {};
EOF

# ---------------------------
# Components (stubs)
# ---------------------------
cat > src/components/practice/PracticeShell.tsx << "EOF"
export default function PracticeShell() {
  return <div>PracticeShell</div>;
}
EOF

cat > src/components/practice/TopicPicker.tsx << "EOF"
export default function TopicPicker() {
  return <div>TopicPicker</div>;
}
EOF

cat > src/components/practice/DifficultyPicker.tsx << "EOF"
export default function DifficultyPicker() {
  return <div>DifficultyPicker</div>;
}
EOF

cat > src/components/practice/ExerciseRenderer/index.ts << "EOF"
export default function ExerciseRenderer() {
  return <div>ExerciseRenderer</div>;
}
EOF

cat > src/components/practice/ExerciseRenderer/Numeric.tsx << "EOF"
export default function Numeric() {
  return <div>Numeric</div>;
}
EOF

cat > src/components/practice/ExerciseRenderer/SingleChoice.tsx << "EOF"
export default function SingleChoice() {
  return <div>SingleChoice</div>;
}
EOF

cat > src/components/practice/ExerciseRenderer/MatrixInput.tsx << "EOF"
export default function MatrixInput() {
  return <div>MatrixInput</div>;
}
EOF

cat > src/components/practice/ExerciseRenderer/VectorDrag.tsx << "EOF"
export default function VectorDrag() {
  return <div>VectorDrag</div>;
}
EOF

cat > src/components/subjects/python/PythonLanding.tsx << "EOF"
export default function PythonLanding() {
  return <div>PythonLanding</div>;
}
EOF

cat > src/components/subjects/linear-algebra/LinearAlgebraLanding.tsx << "EOF"
export default function LinearAlgebraLanding() {
  return <div>LinearAlgebraLanding</div>;
}
EOF

# ---------------------------
# Prisma files (stubs)
# ---------------------------
cat > prisma/schema.prisma << "EOF"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
EOF

mkdir -p prisma/seed
cat > prisma/seed/seed.ts << "EOF"
console.log("TODO: seed runner");
EOF

cat > prisma/seed/data/index.ts << "EOF"
export const SUBJECTS = [];
export const MODULES = [];
export const SECTIONS = [];
export const TOPICS = {};
export const TOPIC_CATALOG = {};
EOF

# subjects/python stubs
cat > prisma/seed/data/subjects/python/index.ts << "EOF"
export * from "./subject";
export * from "./modules";
export * from "./sections";
export * from "./topics";
export * from "./catalog";
EOF

cat > prisma/seed/data/subjects/python/subject.ts << "EOF"
export const subject = { slug: "python", order: 10, title: "Python", description: "Python programming practice." } as const;
EOF

cat > prisma/seed/data/subjects/python/modules.ts << "EOF"
export const PY_MODULES = [];
EOF

cat > prisma/seed/data/subjects/python/sections.ts << "EOF"
export const PY_SECTIONS = [];
EOF

cat > prisma/seed/data/subjects/python/topics.ts << "EOF"
export const PY_TOPICS = {};
EOF

cat > prisma/seed/data/subjects/python/catalog.ts << "EOF"
export const PY_TOPIC_CATALOG = {};
EOF

# subjects/linear-algebra stubs
cat > prisma/seed/data/subjects/linear-algebra/index.ts << "EOF"
export * from "./subject";
export * from "./modules";
export * from "./sections";
export * from "./topics";
export * from "./catalog";
EOF

cat > prisma/seed/data/subjects/linear-algebra/subject.ts << "EOF"
export const subject = { slug: "linear-algebra", order: 0, title: "Linear Algebra", description: "Vectors, matrices, linear systems, and core LA practice." } as const;
EOF

cat > prisma/seed/data/subjects/linear-algebra/modules.ts << "EOF"
export const LA_MODULES = [];
EOF

cat > prisma/seed/data/subjects/linear-algebra/sections.ts << "EOF"
export const LA_SECTIONS = [];
EOF

cat > prisma/seed/data/subjects/linear-algebra/topics.ts << "EOF"
export const LA_TOPICS = {};
EOF

cat > prisma/seed/data/subjects/linear-algebra/catalog.ts << "EOF"
export const LA_TOPIC_CATALOG = {};
EOF

echo ""
echo "✅ Created $APP with your requested structure + stub files."
echo "Next steps:"
echo "  1) Set DATABASE_URL in .env"
echo "  2) npx prisma init (optional) / update schema"
echo "  3) npm run dev"
'
# learnoir-v2
