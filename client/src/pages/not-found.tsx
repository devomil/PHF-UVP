import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh] bg-transparent">
      <div className="text-center">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          404
        </h1>
        <p className="text-xl mt-4" style={{ color: "var(--text-secondary)" }}>Page not found</p>
        <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--text-muted)" }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-purple-500/20">
            Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
