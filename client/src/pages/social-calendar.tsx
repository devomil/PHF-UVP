import { useQuery } from "@tanstack/react-query";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

function SocialCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: postsData } = useQuery({
    queryKey: ["/api/social/posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/posts");
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  const posts = postsData?.posts || [];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: Array<{ day: number; posts: any[] }> = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dayPosts = posts.filter((p: any) => {
        if (!p.scheduledFor) return false;
        const d = new Date(p.scheduledFor);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === i;
      });
      days.push({ day: i, posts: dayPosts });
    }
    return days;
  }, [posts, year, month, daysInMonth]);

  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Content Calendar
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            View and manage your scheduled social posts
          </p>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-card)" }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {monthName}
          </h2>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-center text-xs font-medium"
              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
            >
              {d}
            </div>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[80px] p-2"
              style={{ borderBottom: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)" }}
            />
          ))}

          {calendarDays.map(({ day, posts: dayPosts }) => {
            const isToday =
              day === new Date().getDate() &&
              month === new Date().getMonth() &&
              year === new Date().getFullYear();
            return (
              <div
                key={day}
                className="min-h-[80px] p-2"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  borderRight: "1px solid var(--border-subtle)",
                  backgroundColor: isToday ? "rgba(124,58,237,0.05)" : undefined,
                }}
              >
                <span
                  className={`text-xs font-medium ${isToday ? "bg-purple-600 text-white px-1.5 py-0.5 rounded-full" : ""}`}
                  style={isToday ? {} : { color: "var(--text-secondary)" }}
                >
                  {day}
                </span>
                {dayPosts.map((p: any) => (
                  <div
                    key={p.id}
                    className="mt-1 text-xs px-1.5 py-0.5 rounded truncate"
                    style={{
                      backgroundColor:
                        p.status === "published" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
                      color:
                        p.status === "published" ? "rgb(34,197,94)" : "rgb(59,130,246)",
                    }}
                  >
                    {p.title || p.platforms?.join(", ")}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SocialCalendar;
