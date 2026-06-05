import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday 
} from "date-fns";
import { es } from "date-fns/locale";

interface CalendarProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  className?: string;
  mode?: "single";
  locale?: any;
}

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(selected || new Date());

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  return (
    <div className={`p-3 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-white capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </h4>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </button>
          <button onClick={nextMonth} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["D", "L", "M", "M", "J", "V", "S"].map((day) => (
          <div key={day} className="text-[10px] font-black text-slate-500 py-1">
            {day}
          </div>
        ))}
        {days.map((day, i) => {
          const isSelected = selected && isSameDay(day, selected);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          
          return (
            <button
              key={i}
              onClick={() => onSelect?.(day)}
              className={`
                aspect-square flex items-center justify-center text-[11px] rounded-full transition-all
                ${!isCurrentMonth ? "text-slate-700" : "text-slate-300"}
                ${isSelected ? "bg-primary text-white font-bold shadow-lg shadow-primary/30" : "hover:bg-white/5"}
                ${isToday(day) && !isSelected ? "text-primary font-bold border border-primary/30" : ""}
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
