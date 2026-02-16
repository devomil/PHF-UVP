import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">404</h1>
        <p className="text-gray-500 mt-2">Page not found.</p>
        <Link href="/" className="text-primary hover:underline mt-4 inline-block">
          Go home
        </Link>
      </div>
    </div>
  );
}
