import Translator from "./components/Translator";

export default function Home() {
  return (
    <main className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(224,177,58,0.12),_transparent_42%)]" />
      <Translator />
    </main>
  );
}
