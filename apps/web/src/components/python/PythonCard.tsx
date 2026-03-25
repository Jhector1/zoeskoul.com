import CodeRunner from "@/components/code/CodeRunner";

export default function PythonCard() {
  return (
    <CodeRunner
      title="Try Python: loops"
      language="python"
      hintMarkdown={String.raw`
Write a loop that prints \(1\) to \(5\).
`}
      // initialCode={`for i in range(1, 6):\n  print(i)\n`}
    />
  );
}
