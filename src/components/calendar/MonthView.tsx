import { format, isSameMonth, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Database, Truck } from "lucide-react";
import { motion } from "motion/react";

interface Booking {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  user: string;
  status: "pending" | "in_progress" | "completed";
  category: "camion" | "recibo";
  isSap?: boolean;
}

interface MonthViewProps {
  currentMonth: Date;
  days: Date[];
  bookings: Booking[];
  sapBookings: any[];
  onDayClick: (day: Date) => void;
  selectedDate: Date;
}

export default function MonthView({
  currentMonth,
  days,
  bookings,
  sapBookings,
  onDayClick,
  selectedDate,
}: MonthViewProps) {
  const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  return (
    <div className="flex-1 flex flex-col min-w-[900px] h-full bg-background overflow-hidden font-sans">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border bg-white sticky top-0 z-20 shadow-sm">
        {dayNames.map((day) => (
          <div key={day} className="py-4 text-center text-[11px] font-black tracking-widest text-text-muted uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto custom-scrollbar bg-gray-50/30">
        {days.map((day, idx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);
          const isSelected = isSameDay(day, selectedDate);

          const manualBookings = bookings.filter((b) => b.date === dateStr);
          const sapOrders = sapBookings.filter((b) => b.date === dateStr);
          const allDayBookings = [...manualBookings, ...sapOrders];

          return (
            <div
              key={idx}
              onClick={() => onDayClick(day)}
              className={`
                min-h-[140px] p-3 border-r border-b border-border cursor-pointer group relative overflow-hidden transition-all
                ${!isCurrentMonth ? "bg-gray-50/80 opacity-40" : "bg-white hover:bg-primary/[0.03]"}
                ${isSelected && isCurrentMonth ? "bg-primary/[0.05]" : ""}
              `}
            >
              {/* Selected ring */}
              {isSelected && isCurrentMonth && (
                <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none rounded-sm z-10" />
              )}

              {/* Day number */}
              <div className="flex justify-between items-start mb-3">
                <span
                  className={`
                    text-xs font-black w-8 h-8 flex items-center justify-center rounded-full transition-all tracking-tighter
                    ${isTodayDate
                      ? "bg-primary text-white shadow-lg shadow-primary/30 scale-110"
                      : isCurrentMonth
                        ? "text-text group-hover:bg-primary/10 group-hover:text-primary"
                        : "text-gray-300"}
                    ${isSelected && !isTodayDate && isCurrentMonth ? "ring-2 ring-primary/40 text-primary bg-primary/5" : ""}
                  `}
                >
                  {format(day, "d")}
                </span>
                {allDayBookings.length > 0 && isCurrentMonth && (
                  <div className="flex gap-1">
                    {manualBookings.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    {sapOrders.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                  </div>
                )}
              </div>

              {/* Events */}
              <div className="space-y-1 overflow-hidden">
                {allDayBookings.slice(0, 4).map((booking, bIdx) => {
                  const isSap = "docNum" in booking;
                  const isCompleted = booking.status === "completed";
                  return (
                    <motion.div
                      key={booking.id || bIdx}
                      whileHover={{ x: 2 }}
                      className={`
                        px-2 py-1 text-[10px] rounded-lg truncate flex items-center gap-1.5 font-bold transition-all border
                        ${isSap
                          ? "bg-amber-50 border-amber-100 text-amber-800 shadow-sm shadow-amber-900/5"
                          : "bg-primary/5 border-primary/10 text-primary shadow-sm shadow-primary/5"}
                        ${isCompleted ? "opacity-50 grayscale scale-[0.98]" : ""}
                      `}
                    >
                      {isSap ? <Database className="w-3 h-3 flex-none" /> : <Truck className="w-3 h-3 flex-none" />}
                      <span className="truncate uppercase tracking-tight">
                        {isSap ? `#${(booking as any).docNum}` : booking.user}
                      </span>
                    </motion.div>
                  );
                })}
                {allDayBookings.length > 4 && (
                  <div className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1 pt-1 group-hover:text-primary transition-colors">
                    +{allDayBookings.length - 4} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
