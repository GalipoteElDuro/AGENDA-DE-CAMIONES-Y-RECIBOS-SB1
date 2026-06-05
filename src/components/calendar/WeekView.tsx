import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Database, Clock, Truck } from "lucide-react";
import { motion } from "motion/react";

interface WeekViewProps {
  selectedDate: Date;
  bookings: any[];
  sapBookings: any[];
  onDayClick: (day: Date) => void;
}

export default function WeekView({
  selectedDate,
  bookings,
  sapBookings,
  onDayClick,
}: WeekViewProps) {
  const weekStart = startOfWeek(selectedDate, { locale: es, weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const timeSlots = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden font-sans">
      {/* Day Headers */}
      <div className="grid grid-cols-8 border-b border-border sticky top-0 bg-white z-20 shadow-sm">
        <div className="p-3 border-r border-border flex items-end justify-center pb-3">
          <Clock className="w-4 h-4 text-text-muted" />
        </div>
        {weekDays.map((day) => {
          const isTodayDate = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toString()}
              onClick={() => onDayClick(day)}
              className="p-3 text-center border-r border-border last:border-r-0 cursor-pointer hover:bg-primary/[0.02] transition-all group"
            >
              <div className={`text-[10px] font-black uppercase tracking-[0.15em] mb-1.5 ${isTodayDate ? "text-primary" : "text-text-muted"}`}>
                {format(day, "EEE", { locale: es })}
              </div>
              <div
                className={`
                  text-xl font-black w-10 h-10 flex items-center justify-center rounded-full mx-auto transition-all tracking-tighter
                  ${isTodayDate
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : isSelected
                      ? "bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "text-text group-hover:bg-gray-100"}
                `}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        <div className="grid grid-cols-8 min-h-[1440px] relative">
          {/* Time column */}
          <div className="border-r border-border bg-gray-50/50">
            {timeSlots.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-border/40 px-3 py-2 text-right relative">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-tighter absolute top-2 right-2">
                  {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayBookings = [...bookings, ...sapBookings].filter((b) => b.date === dateStr);
            const isTodayDate = isSameDay(day, new Date());

            return (
              <div
                key={day.toString()}
                className={`h-full border-r border-border last:border-r-0 relative ${isTodayDate ? "bg-primary/[0.01]" : ""}`}
              >
                {/* Horizontal grid lines */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                  {timeSlots.map((hour) => (
                    <div key={hour} className="h-[60px] border-b border-border/40" />
                  ))}
                </div>

                {/* Current Time Indicator for Today's column only */}
                {isTodayDate && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${new Date().getHours() * 60 + new Date().getMinutes()}px` }}
                  >
                    <div className="h-[2px] bg-red-500 w-full relative">
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-md" />
                    </div>
                  </div>
                )}

                {/* Booking chips */}
                <div className="absolute inset-0 z-10 px-1">
                  {dayBookings.map((booking, bIdx) => {
                    const [h, m] = booking.startTime.split(":").map(Number);
                    const [eh, em] = booking.endTime.split(":").map(Number);
                    const top = h * 60 + m;
                    const height = Math.max(eh * 60 + em - top, 32);
                    const isSap = "docNum" in booking;
                    const isCompleted = booking.status === "completed";

                    return (
                      <motion.div
                        key={booking.id || bIdx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ scale: 1.01, zIndex: 30 }}
                        className={`
                          absolute left-0.5 right-0.5 p-2 rounded-xl text-[10px] border cursor-pointer overflow-hidden transition-all flex flex-col justify-start gap-1.5
                          ${isSap
                            ? "bg-amber-50 border-amber-200 text-amber-900 border-l-[6px] border-l-amber-500 shadow-md shadow-amber-900/10"
                            : "bg-white border-primary/20 text-text border-l-[6px] border-l-primary shadow-md shadow-primary/5 hover:border-primary/40"}
                          ${isCompleted ? "opacity-40 grayscale scale-95" : "font-black uppercase tracking-tight"}
                        `}
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <div className="flex items-center gap-2 leading-none">
                          {isSap ? <Database className="w-3.5 h-3.5 text-amber-600 flex-none" /> : <Truck className="w-3.5 h-3.5 text-primary flex-none" />}
                          <span className={`${isSap ? "text-amber-700" : "text-primary"} text-[9px] font-black opacity-80`}>{booking.startTime}</span>
                        </div>
                        <div className="truncate leading-tight px-0.5">{isSap ? `#${(booking as any).docNum}` : booking.user}</div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
