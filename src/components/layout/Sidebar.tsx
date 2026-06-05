import { Calendar } from "../ui/calendar";
import { Database } from "lucide-react";
import { es } from "date-fns/locale";

interface SidebarProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  activeModule: "agenda_camion" | "agenda_recibo" | "asistente_recibo";
  isSidebarOpen: boolean;
}

export default function Sidebar({
  selectedDate,
  setSelectedDate,
  activeModule,
  isSidebarOpen,
}: SidebarProps) {
  return (
    <aside className={`w-[280px] h-full flex-none bg-background border-r border-border p-6 ${isSidebarOpen ? "flex" : "hidden"} lg:flex flex-col gap-8 overflow-y-auto custom-scrollbar transition-all duration-300 font-sans`}>
      
      {/* Date Picker */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 ml-1">
          <div className="w-1.5 h-4 bg-primary rounded-full shadow-sm shadow-primary/20" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-text-muted">Selector de Fecha</h3>
        </div>

        <div className="bg-white rounded-3xl border border-border p-4 shadow-sm hover:border-primary/20 transition-all group">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            locale={es}
            className="text-text"
          />
        </div>
      </div>

      {/* Active Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 ml-1">
          <div className="w-1.5 h-4 bg-primary rounded-full shadow-sm shadow-primary/20" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-text-muted">Filtros de Agenda</h3>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-white rounded-2xl border border-border flex items-center justify-between hover:border-primary/30 transition-all cursor-pointer group shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                <Truck className="w-4 h-4 text-primary group-hover:text-white transition-colors" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-text">Camiones</span>
            </div>
            <div className="w-9 h-5 bg-primary rounded-full relative shadow-inner ring-1 ring-primary/20">
              <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full shadow-md" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-border flex items-center justify-between hover:border-amber-400/50 transition-all cursor-pointer group shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <Database className="w-4 h-4 text-amber-600 group-hover:text-white transition-colors" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-text">Recibos SAP</span>
            </div>
            <div className="w-9 h-5 bg-gray-100 rounded-full relative ring-1 ring-border">
              <div className="absolute left-1 top-1 w-3 h-3 bg-white border border-border rounded-full shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* SAP Integration Card */}
      <div className="p-5 bg-blue-50/50 rounded-3xl border border-primary/10 relative overflow-hidden group">
        <div className="absolute -right-4 -top-4 w-16 h-16 bg-primary/5 rounded-full group-hover:scale-110 transition-transform" />
        <div className="flex items-center gap-3 mb-3">
          <Database className="w-5 h-5 text-primary" />
          <h4 className="text-xs font-black text-text uppercase tracking-widest">SAP Business One</h4>
        </div>
        <p className="text-[11px] font-bold text-text-muted leading-relaxed uppercase tracking-tighter">
          Conexión bidireccional activa vía Service Layer.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-900/40"></span>
          </div>
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Sincronizado</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6 border-t border-border">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted text-center opacity-60">
          Galipote Logistics <span className="text-primary">v2.4.0</span>
        </p>
      </div>
    </aside>
  );
}
