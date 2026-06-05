import { Menu, ChevronLeft, ChevronRight, LogOut, Truck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface HeaderProps {
  userName: string;
  role: string | null;
  currentMonth: Date;
  activeModule: string;
  viewMode: "month" | "week" | "day";
  onViewModeChange: (mode: "month" | "week" | "day") => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onToggleSidebar: () => void;
  onLogout: () => void;
  setActiveModule: (module: any) => void;
}

export default function Header({
  userName,
  role,
  currentMonth,
  activeModule,
  viewMode,
  onViewModeChange,
  onPrevMonth,
  onNextMonth,
  onToday,
  onToggleSidebar,
  onLogout,
  setActiveModule,
}: HeaderProps) {
  return (
    <header className="flex-none bg-white border-b border-border h-20 px-4 md:px-8 flex items-center justify-between z-40 sticky top-0 shadow-sm transition-all font-sans">
      <div className="flex items-center gap-4 md:gap-10">
        {/* Hamburger & Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2.5 rounded-xl hover:bg-gray-100 transition-all text-text-muted hover:text-text lg:hidden active:scale-95"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="bg-primary p-2.5 rounded-2xl shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform duration-300">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-black text-text tracking-tighter uppercase leading-none">Logistics</h1>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.25em] mt-1 opacity-80">SAP B1 Integrated</p>
            </div>
          </div>
        </div>

        <div className="hidden md:block h-8 w-px bg-border/60" />

        {/* Navigation Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToday}
            className="px-5 py-2 border border-border rounded-xl text-[11px] font-black uppercase tracking-widest text-text-muted hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all hidden sm:block shadow-sm active:scale-95"
          >
            Hoy
          </button>
          <div className="flex items-center bg-gray-50 p-1.5 rounded-xl border border-border shadow-inner">
            <button
              onClick={onPrevMonth}
              className="p-1.5 rounded-lg hover:bg-white transition-all text-text-muted hover:text-text hover:shadow-md active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNextMonth}
              className="p-1.5 rounded-lg hover:bg-white transition-all text-text-muted hover:text-text hover:shadow-md active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-lg font-black text-text capitalize ml-3 hidden lg:block tracking-tight">
            {format(currentMonth, "MMMM 'de' yyyy", { locale: es })}
          </h2>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4 md:gap-6">
        {/* Module Switcher (Desktop) */}
        <div className="hidden lg:flex bg-gray-50/80 p-1.5 rounded-2xl border border-border shadow-inner">
          <button
            onClick={() => setActiveModule("agenda_camion")}
            className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              activeModule === "agenda_camion"
                ? "bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]"
                : "text-text-muted hover:text-text hover:bg-white/80"
            }`}
          >
            Camiones
          </button>
          <button
            onClick={() => setActiveModule("asistente_recibo")}
            className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              activeModule === "asistente_recibo"
                ? "bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]"
                : "text-text-muted hover:text-text hover:bg-white/80"
            }`}
          >
            Recibos
          </button>
        </div>

        {/* View Mode */}
        <div className="relative group">
          <select
            value={viewMode}
            onChange={(e) => onViewModeChange(e.target.value as any)}
            className="appearance-none bg-white border-2 border-border rounded-xl px-5 py-2.5 pr-11 text-[11px] font-black uppercase tracking-widest text-text hover:border-primary/40 focus:outline-none focus:border-primary/60 cursor-pointer min-w-[120px] transition-all shadow-sm group-hover:shadow-md"
          >
            <option value="day">Día</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronLeft className="w-4 h-4 text-primary -rotate-90 opacity-60" />
          </div>
        </div>

        <div className="flex items-center gap-5 border-l border-border pl-6">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-black text-text uppercase tracking-widest leading-none">{userName || "Usuario"}</p>
            <p className="text-[10px] font-black text-primary/70 uppercase tracking-[0.1em] mt-1.5 opacity-80">
              {role === "chofer" ? "Conductor" : "Administrador"}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="p-3 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all border border-red-100 hover:border-red-500 shadow-sm active:scale-95 group"
          >
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>
    </header>
  );
}
