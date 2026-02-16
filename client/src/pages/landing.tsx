import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="text-center max-w-lg px-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">HR Management</h1>
        <p className="text-gray-600 mb-8">
          Streamline your workforce management with scheduling, time tracking, training, and more.
        </p>
        <Link href="/auth">
          <Button size="lg" className="px-8">
            Get Started
          </Button>
        </Link>
      </div>
    </div>
  );
}
