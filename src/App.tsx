import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Truck, User, Clock, CheckCircle2, LogOut, Shield,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Server, Database, Lock,
  Trash2, Edit, AlertTriangle, Mail, Phone, MessageCircle, Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, isToday, parse, addMinutes, isBefore, getDay
} from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "./lib/supabase";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import MainContent from "./components/layout/MainContent";
import MonthView from "./components/calendar/MonthView";
import WeekView from "./components/calendar/WeekView";

// Utility: truncate long supplier names from SAP
const poTitle = (name: string) => name?.length > 30 ? name.substring(0, 28) + "…" : (name || "Proveedor SAP");


interface TruckData {
  id: string;
  name: string;
}

interface Booking {
  id: string;
  truckId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  user: string;
  status: "pending" | "in_progress" | "completed";
  category: "camion" | "recibo";
  isSap?: boolean;
  docNum?: string | number;
  materialType?: "carga_ligera" | "carga_estandar" | "carga_pesada";
}

type Role = "chofer" | "agendador" | null;
type Module = "agenda_camion" | "agenda_recibo" | "asistente_recibo";
type BookingStatus = Booking["status"];
type LoadState = "libre" | "medio" | "ocupado";
type ReceiptFilterMode = "open" | "relevant" | "all";

interface SapPurchaseOrder {
  DocEntry: number;
  DocNum: number;
  CardName: string;
  DocDueDate: string;
  DocTotal: number;
  DocStatus: "bost_Open" | "bost_Close" | string;
}

// Supabase real-time channel placeholder
let bookingsChannel: any = null;

const DAY_START_MINUTES = 6 * 60;
const DAY_END_MINUTES = 22 * 60;
const DAILY_CAPACITY_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

const toDateTimeMs = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

const getBookingRange = (booking: Pick<Booking, "date" | "startTime" | "endTime">) => ({
  startMs: toDateTimeMs(booking.date, booking.startTime),
  endMs: toDateTimeMs(booking.date, booking.endTime),
});

const hasTimeOverlap = (
  source: Pick<Booking, "date" | "startTime" | "endTime">,
  target: Pick<Booking, "date" | "startTime" | "endTime">
) => {
  const sourceRange = getBookingRange(source);
  const targetRange = getBookingRange(target);
  return sourceRange.startMs < targetRange.endMs && sourceRange.endMs > targetRange.startMs;
};

const getBusyMinutes = (dayBookings: Booking[]) => (
  dayBookings.reduce((total, booking) => {
    const startMinutes = Math.max(
      DAY_START_MINUTES,
      Number.parseInt(booking.startTime.slice(0, 2), 10) * 60 + Number.parseInt(booking.startTime.slice(3, 5), 10)
    );
    const endMinutes = Math.min(
      DAY_END_MINUTES,
      Number.parseInt(booking.endTime.slice(0, 2), 10) * 60 + Number.parseInt(booking.endTime.slice(3, 5), 10)
    );

    return total + Math.max(0, endMinutes - startMinutes);
  }, 0)
);

const getLoadState = (dayBookings: Booking[]): LoadState => {
  if (dayBookings.length === 0) return "libre";

  const loadRatio = getBusyMinutes(dayBookings) / DAILY_CAPACITY_MINUTES;
  if (loadRatio >= 0.7 || dayBookings.length >= 4) return "ocupado";
  if (loadRatio >= 0.35 || dayBookings.length >= 2) return "medio";
  return "libre";
};


const AnimatedBackground = () => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/[0.03] rounded-full blur-[120px]" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-primary/[0.05] rounded-full blur-[130px]" />
    <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-primary/[0.02] rounded-full blur-[100px]" />
  </div>
);

const GlassContainer = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white/95 backdrop-blur-md border border-border rounded-[3rem] shadow-soft ${className}`}>
    {children}
  </div>
);


const LoginScreen = ({ onLogin, loading, error, sl, setSl, db, setDb, user, setUser, pass, setPass }: any) => (
  <div className="min-h-screen bg-background flex flex-col relative overflow-hidden font-sans">
    <AnimatedBackground />
    <div className="flex-1 flex items-center justify-center p-6 relative z-10 w-full max-w-xl mx-auto">
      <div className="w-full flex flex-col justify-center gap-8 py-10 animate-fade-up">
        <div className="flex flex-col items-center gap-8 mb-4 text-center">
          <div className="p-6 bg-primary rounded-[3rem] shadow-2xl shadow-primary/30 transform hover:rotate-3 transition-transform duration-500">
            <Truck className="w-14 h-14 text-white" />
          </div>
          <div className="space-y-3">
            <h1 className="text-5xl font-black tracking-tighter text-text uppercase leading-none">Galipote <span className="text-primary">Logistics</span></h1>
            <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] opacity-70">SAP Business One Suite v2.4</p>
          </div>
        </div>

        <GlassContainer className="p-10 sm:p-12 border-primary/10 shadow-lg">
          <form 
            onSubmit={(e) => { e.preventDefault(); onLogin(); }}
            className="space-y-8"
          >
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 italic opacity-70">Service Layer Endpoint</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 p-2 bg-gray-100 rounded-xl group-focus-within:bg-primary/10 group-focus-within:text-primary transition-all">
                    <Globe className="w-4 h-4 text-gray-400 group-focus-within:text-primary" />
                  </div>
                  <input
                    type="url"
                    value={sl}
                    onChange={(e) => setSl(e.target.value)}
                    className="w-full pl-16 pr-6 py-5 rounded-2xl border-2 border-border bg-gray-50 focus:bg-white focus:border-primary focus:ring-8 focus:ring-primary/5 transition-all font-black text-sm text-text placeholder:text-gray-300 outline-none"
                    placeholder="https://sap-server:50000/b1s/v1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 italic opacity-70">Company DB</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 p-2 bg-gray-100 rounded-xl group-focus-within:bg-primary/10 group-focus-within:text-primary transition-all">
                      <Database className="w-4 h-4 text-gray-400 group-focus-within:text-primary" />
                    </div>
                    <input
                      type="text"
                      value={db}
                      onChange={(e) => setDb(e.target.value)}
                      className="w-full pl-16 pr-6 py-5 rounded-2xl border-2 border-border bg-gray-50 focus:bg-white focus:border-primary outline-none transition-all font-black text-sm text-text placeholder:text-gray-300"
                      placeholder="SBO_PROD"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 italic opacity-70">B1 User</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 p-2 bg-gray-100 rounded-xl group-focus-within:bg-primary/10 group-focus-within:text-primary transition-all">
                      <User className="w-4 h-4 text-gray-400 group-focus-within:text-primary" />
                    </div>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      className="w-full pl-16 pr-6 py-5 rounded-2xl border-2 border-border bg-gray-50 focus:bg-white focus:border-primary outline-none transition-all font-black text-sm text-text placeholder:text-gray-300"
                      placeholder="manager"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 italic opacity-70">Password</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 p-2 bg-gray-100 rounded-xl group-focus-within:bg-primary/10 group-focus-within:text-primary transition-all">
                    <Lock className="w-4 h-4 text-gray-400 group-focus-within:text-primary" />
                  </div>
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="w-full pl-16 pr-6 py-5 rounded-2xl border-2 border-border bg-gray-50 focus:bg-white focus:border-primary outline-none transition-all font-black text-sm text-text placeholder:text-gray-300"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-2xl bg-primary text-white text-[13px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:grayscale"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sincronizando...</span>
                </div>
              ) : (
                <>Ingresar al Panel <ChevronRight className="w-5 h-5" /></>
              )}
            </button>

            {error && (
              <div className="p-5 bg-red-50 border-2 border-red-100 rounded-2xl text-red-600 text-center animate-shake">
                <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
              </div>
            )}
          </form>
        </GlassContainer>
        
        <div className="flex flex-col items-center gap-2 opacity-40">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-text-muted">
            Desarrollado por Galipote Tech
          </p>
          <div className="h-1 w-12 bg-primary/30 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [activeModule, setActiveModule] = useState<Module>(
    (localStorage.getItem("active_module") as Module) || "agenda_camion"
  );
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [serviceLayer, setServiceLayer] = useState(localStorage.getItem("sap_url") || "");
  const [database, setDatabase] = useState(localStorage.getItem("sap_db") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sapBookings, setSapBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [receiptFilterMode, setReceiptFilterMode] = useState<ReceiptFilterMode>("open");
  
  // New Booking State
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [bookingUser, setBookingUser] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    type: "danger" | "primary";
    showCancel?: boolean;
    confirmLabel?: string;
  } | null>(null);

  // Booking Edit State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [calendarTruckFilterId, setCalendarTruckFilterId] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // New Google Calendar Style States
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">(
    (localStorage.getItem("view_mode") as any) || "month"
  );
  const [showSidebar, setShowSidebar] = useState(
    localStorage.getItem("show_sidebar") !== "false"
  );

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem("view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("active_module", activeModule);
  }, [activeModule]);

  useEffect(() => {
    localStorage.setItem("show_sidebar", String(showSidebar));
  }, [showSidebar]);

  // Day Details Modal State
  const [showDayDetailsModal, setShowDayDetailsModal] = useState(false);
  const [selectedDayForDetails, setSelectedDayForDetails] = useState<Date | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch Trucks from Supabase (or fallback to hardcoded if table doesn't exist yet)
        const { data: trucksData, error: trucksError } = await supabase.from('trucks').select('*');
        if (!trucksError && trucksData && trucksData.length > 0) {
          setTrucks(trucksData);
          setSelectedTruckId(trucksData[0].id);
          setCalendarTruckFilterId(trucksData[0].id);
        } else {
          // Fallback initial trucks
          const fallbackTrucks = [
            { id: "1", name: "Camión 01 - Volvo FH" },
            { id: "2", name: "Camión 02 - Scania R" },
          ];
          setTrucks(fallbackTrucks);
          setSelectedTruckId(fallbackTrucks[0].id);
          setCalendarTruckFilterId(fallbackTrucks[0].id);
        }

        // Fetch Bookings from Supabase
        const { data: bookingsData } = await supabase.from('bookings').select('*');
        if (bookingsData) {
          setBookings(bookingsData);
        }
      } catch (err) {
        console.error("Error fetching initial data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchSapOrders = useCallback(async () => {
    if (!isLoggedIn || !userSessionId || activeModule !== "agenda_recibo") return;
    
    setIsLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      
      const params = new URLSearchParams({
        userSessionId,
        startDate: start,
        endDate: end,
        mode: receiptFilterMode,
      });

      const response = await fetch(`/api/sap/purchase-orders?${params.toString()}`);
      
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        const mapped = result.data.map((po: SapPurchaseOrder) => ({
          id: po.DocEntry.toString(),
          truckId: "sap",
          date: po.DocDueDate?.includes("T") ? po.DocDueDate.split("T")[0] : po.DocDueDate,
          startTime: "00:00",
          endTime: "23:59",
          user: po.CardName,
          status: po.DocStatus === "bost_Open" ? "pending" : "completed",
          category: "recibo" as const,
          isSap: true,
          docNum: po.DocNum,
          materialType: po.DocTotal >= 10000 ? "carga_pesada" : po.DocTotal >= 3000 ? "carga_estandar" : "carga_ligera",
        }));
        setSapBookings(mapped);
      } else {
        setSapBookings([]);
      }
    } catch (error) {
      console.error("Error fetching SAP orders:", error);
      setSapBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, userSessionId, activeModule, currentMonth, receiptFilterMode]);

  useEffect(() => {
    if (activeModule === "agenda_recibo") {
      fetchSapOrders();
    }
  }, [activeModule, currentMonth, isLoggedIn, receiptFilterMode, fetchSapOrders]);

  useEffect(() => {
    // Set up Supabase Realtime
    bookingsChannel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBookings(prev => [...prev, payload.new as Booking]);
          } else if (payload.eventType === 'DELETE') {
            setBookings(prev => prev.filter(b => b.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setBookings(prev => prev.map(b => b.id === payload.new.id ? payload.new as Booking : b));
          }
        }
      )
      .subscribe();

    return () => {
      if (bookingsChannel) supabase.removeChannel(bookingsChannel);
    };
  }, []);

  const handleLogin = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      // 1. Authenticate with SAP via our server proxy
      const sapResponse = await fetch("/api/sap/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceLayerUrl: serviceLayer,
          companyDB: database,
          userName,
          password
        })
      });

      const sapData = await sapResponse.json();

      if (!sapResponse.ok || !sapData.success) {
        throw new Error(sapData.message || "Credenciales de SAP B1 inválidas.");
      }

      // 2. Authenticate with Supabase
      // We use a shadow email format for consistency across SAP/Supabase
      const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
        email: `${userName.toLowerCase()}@sap.local`,
        password: password,
      });

      if (sbError) {
        console.warn("Supabase Auth Error:", sbError.message);
        // Phase 4 will handle auto-registration if SAP succeeds but SB doesn't yet have the user
      }

      // 3. Success state
      localStorage.setItem("sap_url", serviceLayer);
      localStorage.setItem("sap_db", database);
      localStorage.setItem("user_session", sapData.userSessionId);
      
      setUserSessionId(sapData.userSessionId);
      setRole(sapData.userRole || "agendador");
      setIsLoggedIn(true);
      setSuccessMessage("Conexión exitosa con SAP y Supabase");
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (error: any) {
      setErrorMessage(error.message || "No se pudo establecer conexión con el sistema.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (userSessionId) {
      try {
        await fetch("/api/sap/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userSessionId }),
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
    
    setIsLoggedIn(false);
    setRole(null);
    setUserName("");
    setPassword("");
    setServiceLayer("");
    setDatabase("");
    setUserSessionId(null);
  };

  const findBookingConflict = useCallback(async (
    bookingPayload: Pick<Booking, "truckId" | "date" | "startTime" | "endTime">
  ) => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, truckId, date, startTime, endTime, user, status, category")
      .eq("truckId", bookingPayload.truckId)
      .eq("date", bookingPayload.date);

    if (error) throw error;

    return (data || []).find((booking) => (
      booking.id !== (editingBookingId || "") &&
      hasTimeOverlap(bookingPayload, booking as Booking)
    )) as Booking | undefined;
  }, [editingBookingId]);

  const createBooking = async () => {
    if (!selectedTruckId) return;
    
    if (startTime >= endTime) {
      setConfirmConfig({
        title: "Horario Inválido",
        message: "La hora de inicio debe ser menor a la hora de fin",
        onConfirm: () => setShowConfirmModal(false),
        type: "danger"
      });
      setShowConfirmModal(true);
      return;
    }

    const bookingPayload = {
      truckId: selectedTruckId,
      date: format(selectedDate, "yyyy-MM-dd"),
      startTime,
      endTime,
      user: userName,
      category: activeModule === "agenda_camion" ? "camion" : "recibo"
    };

    setIsLoading(true);
    try {
      const conflicting = await findBookingConflict(bookingPayload);

      if (conflicting) {
        setConfirmConfig({
          title: "Conflicto Logístico",
          message: `El camión ya tiene una tarea asignada de ${conflicting.startTime} a ${conflicting.endTime}.`,
          onConfirm: () => setShowConfirmModal(false),
          type: "danger"
        });
        setShowConfirmModal(true);
        return;
      }

      if (editingBookingId) {
        const { error } = await supabase.from('bookings').update(bookingPayload).eq('id', editingBookingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bookings').insert({ ...bookingPayload, status: "pending" });
        if (error) throw error;
      }
      setShowBookingModal(false);
      setEditingBookingId(null);
      setSuccessMessage("Agenda sincronizada con éxito");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error("Supabase error:", e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    try {
      await supabase.from('bookings').update({ status }).eq('id', bookingId);
    } catch (e) {
      console.error("Update error:", e);
    }
  };

  const deleteBooking = async (bookingId: string) => {
    setConfirmConfig({
      title: "Eliminar Agenda",
      message: "¿Estás seguro que deseas eliminar esta agenda? Esta acción no se puede deshacer.",
      onConfirm: async () => {
        try {
          await supabase.from('bookings').delete().eq('id', bookingId);
          setSuccessMessage("Reserva eliminada local y remotamente");
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (e) { console.error(e); }
      },
      type: "danger"
    });
    setShowConfirmModal(true);
  };

  const openEditModal = (booking: Booking) => {
    setEditingBookingId(booking.id);
    setSelectedTruckId(booking.truckId);
    setSelectedDate(parse(booking.date, "yyyy-MM-dd", new Date()));
    setStartTime(booking.startTime);
    setEndTime(booking.endTime);
    setShowBookingModal(true);
  };

  // Calendar Helpers
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const bookingsForSelectedDate = useMemo(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return bookings.filter(b => b.date === dateStr && b.truckId === selectedTruckId);
  }, [bookings, selectedDate, selectedTruckId]);

  const filteredTruckBookings = useMemo(() => (
    bookings.filter((booking) => (
      !calendarTruckFilterId || booking.truckId === calendarTruckFilterId
    ))
  ), [bookings, calendarTruckFilterId]);

  const dayDetailBookings = useMemo(() => {
    if (!selectedDayForDetails) return [];

    const dateStr = format(selectedDayForDetails, "yyyy-MM-dd");
    const dayManual = bookings.filter((booking) => (
      booking.date === dateStr && (!calendarTruckFilterId || booking.truckId === calendarTruckFilterId)
    ));
    const daySap = sapBookings.filter((booking) => booking.date === dateStr);

    return [...dayManual, ...daySap].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, sapBookings, selectedDayForDetails, calendarTruckFilterId]);

  const openDayDetails = (day: Date) => {
    setSelectedDate(day);
    setSelectedDayForDetails(day);
    setShowDayDetailsModal(true);
  };

  const timeSlots = useMemo(() => {
    const slots = [];
    let current = parse("00:00", "HH:mm", new Date());
    const end = parse("23:30", "HH:mm", new Date());
    
    while (isBefore(current, addMinutes(end, 1))) {
      slots.push(format(current, "HH:mm"));
      current = addMinutes(current, 30);
    }
    return slots;
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-text pb-20 lg:pb-0">
      {!isLoggedIn ? (
        <LoginScreen 
          onLogin={handleLogin}
          loading={isLoading}
          error={errorMessage}
          sl={serviceLayer}
          setSl={setServiceLayer}
          db={database}
          setDb={setDatabase}
          user={userName}
          setUser={setUserName}
          pass={password}
          setPass={setPassword}
        />
      ) : (
        <div className="flex flex-col h-screen bg-background text-text">
          <Header
            userName={userName}
            role={role}
            currentMonth={currentMonth}
            activeModule={activeModule}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onToday={() => setSelectedDate(new Date())}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onLogout={handleLogout}
            setActiveModule={setActiveModule}
          />
          <div className="flex flex-1 overflow-hidden">
            <AnimatePresence>
              {showSidebar && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Sidebar
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    activeModule={activeModule}
                    isSidebarOpen={showSidebar}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Content */}
            <MainContent showSidebar={showSidebar}>
              <div className="flex-1 flex flex-col overflow-hidden h-full">
                {viewMode === "month" && (
                  <MonthView
                    currentMonth={currentMonth}
                    days={days}
                    bookings={activeModule === "agenda_camion" ? filteredTruckBookings : bookings.filter(b => b.category === "recibo")}
                    sapBookings={activeModule === "agenda_camion" ? [] : sapBookings}
                    onDayClick={openDayDetails}
                    selectedDate={selectedDate}
                  />
                )}

                {viewMode === "week" && (
                  <WeekView
                    selectedDate={selectedDate}
                    bookings={activeModule === "agenda_camion" ? filteredTruckBookings : bookings.filter(b => b.category === "recibo")}
                    sapBookings={activeModule === "agenda_camion" ? [] : sapBookings}
                    onDayClick={(day) => {
                      setSelectedDate(day);
                      setViewMode("day");
                    }}
                  />
                )}

                {viewMode === "day" && (
                  <div className="flex-1 flex flex-col min-h-0 bg-background transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-x-0 h-20 bg-gradient-to-b from-surface/20 to-transparent pointer-events-none z-10" />
                    {/* Day View Header — Google Calendar Style */}
                    <div className="flex-none pt-8 pb-4 border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30">
                      <div className="flex items-start">
                        {/* Empty corner for time column alignment */}
                        <div className="w-20 flex-none" />
                        
                        <div className="flex-1 px-4 flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                                {format(selectedDate, "MMM", { locale: es })}
                              </span>
                              <div className={`w-12 h-12 flex items-center justify-center rounded-full text-2xl font-black transition-all ${
                                isToday(selectedDate) 
                                  ? "bg-primary text-white shadow-lg shadow-primary/30" 
                                  : "text-text"
                              }`}>
                                {format(selectedDate, "d")}
                              </div>
                            </div>
                            
                            <div className="h-12 w-px bg-border mx-2" />
                            
                            <div>
                              <h2 className="text-2xl font-black text-text capitalize tracking-tighter">
                                {format(selectedDate, "EEEE", { locale: es })}
                              </h2>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`w-2 h-2 rounded-full ${activeModule === "agenda_camion" ? "bg-primary" : "bg-warning"}`} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                                  {activeModule === "agenda_camion" ? "Agenda de Camiones" : "Logística SAP"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {role === "agendador" && activeModule === "agenda_camion" && (
                            <button
                              onClick={() => setShowBookingModal(true)}
                              className="btn-primary flex items-center gap-2.5 px-8 py-3.5 rounded-2xl shadow-2xl shadow-primary/30 active:scale-95 transition-all text-[11px] font-black uppercase tracking-[0.2em]"
                            >
                              <Plus className="w-4 h-4" />
                              Programar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Hourly Grid Scrollable Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-background relative">
                      <div className="flex min-w-[600px] h-[1440px] relative">
                        {/* Time Column */}
                        <div className="w-20 border-r border-border flex-none bg-background/50 z-10">
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="h-[60px] relative">
                              <span className="absolute -top-2.5 right-4 text-[11px] font-bold text-text-muted uppercase tracking-tighter">
                                {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Grid and Events Area */}
                        <div className="flex-1 relative bg-white">
                          {/* Horizontal grid lines */}
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="h-[60px] border-b border-border/60 w-full" />
                          ))}

                          {/* Current Time Indicator */}
                          {isToday(selectedDate) && (
                            <div
                               className="absolute left-0 right-0 z-20 pointer-events-none"
                               style={{ top: `${new Date().getHours() * 60 + new Date().getMinutes()}px` }}
                            >
                              <div className="h-[2px] bg-red-500 w-full relative">
                                <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-md" />
                              </div>
                            </div>
                          )}

                          {/* Bookings / Events */}
                          <div className="absolute inset-0">
                            {dayDetailBookings.map((booking) => {
                              const [h, m] = booking.startTime.split(":").map(Number);
                              const [eh, em] = booking.endTime.split(":").map(Number);
                              const top = h * 60 + m;
                              const height = Math.max(eh * 60 + em - top, 32);
                              const isSap = (booking as any).isSap;
                              const isCompleted = booking.status === "completed";

                              return (
                                <motion.div
                                  key={booking.id}
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  onClick={() => !isSap && openEditModal(booking)}
                                  className={`
                                    absolute left-2.5 right-6 p-4 rounded-3xl border-l-[8px] shadow-xl cursor-pointer group transition-all hover:z-30 hover:scale-[1.02] flex flex-col justify-between 
                                    ${isSap
                                      ? "bg-amber-50 border-amber-500 shadow-amber-900/10 shadow-sm"
                                      : booking.status === "completed"
                                      ? "bg-emerald-50 border-emerald-500 opacity-60 shadow-emerald-900/5 shadow-sm"
                                      : "bg-white border-primary shadow-primary/10 hover:shadow-primary/20"}
                                    ${isCompleted ? "opacity-40 grayscale scale-95" : "font-black tracking-tight"}
                                  `}
                                  style={{ top: `${top}px`, height: `${height}px` }}
                                >
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Clock className={`w-3.5 h-3.5 ${isSap ? "text-amber-600" : "text-primary opacity-60"}`} />
                                        <span className={`text-[11px] font-black uppercase tracking-widest ${
                                          isSap ? "text-amber-700" : isCompleted ? "text-emerald-700" : "text-primary"
                                        }`}>
                                          {booking.startTime} - {booking.endTime}
                                        </span>
                                      </div>
                                      <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                                        booking.status === "completed" ? "bg-emerald-500 ring-2 ring-emerald-100" : booking.status === "in_progress" ? "bg-primary ring-2 ring-blue-100" : "bg-amber-500 ring-2 ring-amber-100"
                                      }`} />
                                    </div>
                                    <h4 className={`text-base font-black truncate leading-tight uppercase tracking-tight ${
                                      booking.isSap ? "text-amber-950" : booking.status === "completed" ? "text-emerald-950" : "text-text"
                                    }`}>
                                      {booking.isSap ? `ORDEN #${booking.docNum}` : booking.user}
                                    </h4>
                                    <p className={`text-[11px] font-black mt-1.5 truncate uppercase tracking-[0.1em] opacity-60 ${
                                      booking.isSap ? "text-amber-800" : booking.status === "completed" ? "text-emerald-800" : "text-text-muted"
                                    }`}>
                                      {booking.isSap
                                        ? poTitle(booking.user)
                                        : trucks.find((t) => t.id === booking.truckId)?.name || "Transporte Programado"}
                                    </p>
                                  </div>

                                  {/* Quick Actions for Chauffeurs */}
                                  {role === "chofer" && !booking.isSap && booking.status !== "completed" && (
                                    <div className="absolute bottom-3 right-3 flex gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateStatus(
                                            booking.id,
                                            booking.status === "pending" ? "in_progress" : "completed"
                                          );
                                        }}
                                        className="p-2 px-5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/30 active:scale-95 transition-all"
                                      >
                                        {booking.status === "pending" ? "Iniciar" : "Terminar"}
                                      </button>
                                    </div>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </MainContent>
          </div>

          {/* Mobile Module Switcher - Galipote Style */}
          <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-border p-3 lg:hidden z-[100] shadow-2xl">
            <div className="flex justify-around items-center max-w-md mx-auto">
              <button
                onClick={() => setActiveModule("agenda_camion")}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${
                  activeModule === "agenda_camion"
                    ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105"
                    : "text-text-muted"
                }`}
              >
                <Truck className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Camiones</span>
              </button>
              <button
                onClick={() => setActiveModule("asistente_recibo")}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${
                  activeModule === "asistente_recibo"
                    ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105"
                    : "text-text-muted"
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Recibos</span>
              </button>
            </div>
          </nav>

          <AnimatePresence>
            {showBookingModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white w-full max-w-md rounded-[2.5rem] border border-border shadow-soft overflow-hidden"
                >
                  <div className="flex items-center justify-between p-8 border-b border-border">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-lg">
                        <Truck className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-black text-text uppercase tracking-tighter">
                        {editingBookingId ? "Editar agendamiento" : "Nuevo agendamiento"}
                      </h3>
                    </div>
                    <button onClick={() => setShowBookingModal(false)} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors text-gray-500 hover:text-gray-900">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-8 space-y-6">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Referencia / Chofer</label>
                        <input
                          type="text"
                          value={bookingUser}
                          onChange={(e) => setBookingUser(e.target.value)}
                          className="w-full px-5 py-4 rounded-2xl border border-border bg-gray-50 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none text-sm font-bold text-text placeholder:text-gray-400 transition-all font-sans"
                          placeholder="Nombre del chofer o placa"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Fecha</label>
                          <input
                            type="date"
                            value={format(selectedDate, "yyyy-MM-dd")}
                            onChange={(e) => setSelectedDate(parse(e.target.value, "yyyy-MM-dd", new Date()))}
                            className="w-full px-5 py-4 rounded-2xl border border-border bg-gray-50 focus:bg-white focus:border-primary outline-none text-sm font-bold text-text transition-all font-sans"
                          />
                        </div>

                        <div className="space-y-2 relative">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Transporte</label>
                          <select 
                            value={selectedTruckId || ""}
                            onChange={(e) => setSelectedTruckId(e.target.value)}
                            className="w-full px-5 py-4 rounded-2xl border border-border bg-gray-50 focus:bg-white focus:border-primary outline-none text-sm font-bold text-text appearance-none cursor-pointer transition-all font-sans"
                          >
                            {trucks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <ChevronLeft className="w-4 h-4 text-gray-400 absolute right-4 bottom-[18px] pointer-events-none -rotate-90" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 relative">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Hora Inicio</label>
                          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-border bg-gray-50 focus:bg-white focus:border-primary outline-none text-sm font-bold text-text appearance-none cursor-pointer transition-all font-sans">
                            {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                          </select>
                          <Clock className="w-4 h-4 text-gray-400 absolute right-4 bottom-[18px] pointer-events-none" />
                        </div>
                        <div className="space-y-2 relative">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Hora Fin</label>
                          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-border bg-gray-50 focus:bg-white focus:border-primary outline-none text-sm font-bold text-text appearance-none cursor-pointer transition-all font-sans">
                            {timeSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                          </select>
                          <Clock className="w-4 h-4 text-gray-400 absolute right-4 bottom-[18px] pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border">
                      <button 
                        onClick={() => setShowBookingModal(false)}
                        className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-text-muted hover:text-text hover:bg-gray-100 rounded-2xl transition-all active:scale-95"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={createBooking} 
                        className="btn-primary flex-1 py-4 text-[11px] rounded-2xl"
                      >
                        {editingBookingId ? "Actualizar" : "Guardar Evento"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDayDetailsModal && selectedDayForDetails && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <div className="bg-white w-full max-w-xl rounded-[2.5rem] border border-border shadow-soft overflow-hidden overflow-y-auto max-h-[90vh] animate-fade-up">
                  <div className="flex items-center justify-between p-8 border-b border-border bg-gray-50/30">
                    <div>
                      <h3 className="text-2xl font-black text-text uppercase tracking-tighter">
                        {format(selectedDayForDetails, "EEEE d 'MMMM'", { locale: es })}
                      </h3>
                      <p className="text-[11px] font-black text-primary uppercase tracking-[0.4em] mt-1.5 opacity-70">
                        Agenda del día
                      </p>
                    </div>
                    <button onClick={() => setShowDayDetailsModal(false)} className="p-3 bg-gray-100/80 hover:bg-gray-200 rounded-2xl transition-all text-text-muted hover:text-text active:scale-90">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-8 bg-gray-50/50">
                    <div className="space-y-4">
                      {dayDetailBookings.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-border/60">
                          <Clock className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No hay eventos para hoy</p>
                        </div>
                      ) : (
                        dayDetailBookings.map((b) => (
                          <div key={b.id} className="bg-white p-6 rounded-3xl border border-border shadow-sm hover:border-primary/20 transition-all group">
                            <div className="flex items-start gap-5">
                              <div className={`w-1.5 h-16 rounded-full mt-1.5 ${
                                b.status === 'completed'
                                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20'
                                  : b.status === 'in_progress'
                                    ? 'bg-primary shadow-lg shadow-primary/30'
                                    : 'bg-amber-500 shadow-lg shadow-amber-500/20'
                              }`} />
                              <div className="flex-1">
                                <div className="flex justify-between items-start gap-6">
                                  <div>
                                    <span className="font-black text-text text-lg block uppercase tracking-tight leading-none mb-1">
                                      {b.isSap ? `ORDEN #${b.docNum}` : b.user}
                                    </span>
                                    <span className="text-[11px] font-black text-text-muted uppercase tracking-widest opacity-60">
                                      {b.isSap ? `Carga SAP • ${b.materialType}` : trucks.find((truck) => truck.id === b.truckId)?.name || 'Carga Programada'}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="inline-flex items-center gap-2 text-[11px] font-black text-primary bg-primary/5 px-4 py-2 rounded-xl border border-primary/10">
                                      <Clock className="w-3.5 h-3.5" />
                                      {b.startTime} - {b.endTime}
                                    </span>
                                  </div>
                                </div>
                                
                                {b.isSap && (
                                  <div className="mt-4 p-4 bg-amber-50 rounded-2xl text-[11px] text-amber-800 border border-amber-100 flex items-center gap-4 shadow-sm shadow-amber-900/5">
                                    <Database className="w-5 h-5 flex-none text-amber-600" />
                                    <div>
                                      <div className="font-black mb-1 uppercase tracking-widest">{poTitle(b.user)}</div>
                                      <div className="opacity-70 font-bold tracking-tight">Sincronizado vía SAP Service Layer</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {!b.isSap && activeModule === "agenda_camion" && (
                              <div className="mt-6 flex items-center justify-end gap-3 border-t border-border/50 pt-5">
                                {role === "agendador" && b.status !== "completed" && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setShowDayDetailsModal(false);
                                        openEditModal(b);
                                      }}
                                      className="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-xl border border-primary/20 transition-all hover:border-primary/40 active:scale-95"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowDayDetailsModal(false);
                                        deleteBooking(b.id);
                                      }}
                                      className="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-xl border border-red-200 transition-all hover:border-red-300 active:scale-95"
                                    >
                                      ELIMINAR
                                    </button>
                                  </>
                                )}
                                {role === "chofer" && b.status === "pending" && (
                                  <button
                                    onClick={() => updateStatus(b.id, "in_progress")}
                                    className="bg-primary px-8 py-3 text-[11px] font-black text-white rounded-xl shadow-xl shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
                                  >
                                    Iniciar Operación
                                  </button>
                                )}
                                {role === "chofer" && b.status === "in_progress" && (
                                  <button
                                    onClick={() => updateStatus(b.id, "completed")}
                                    className="bg-emerald-500 px-8 py-3 text-[11px] font-black text-white rounded-xl shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
                                  >
                                    Finalizar Tarea
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div className="px-8 py-6 border-t border-border bg-white flex justify-end gap-4">
                    <button onClick={() => setShowDayDetailsModal(false)} className="px-7 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted hover:text-text hover:bg-gray-100 rounded-2xl transition-all active:scale-95">
                      Cerrar
                    </button>
                    {role === "agendador" && activeModule === "agenda_camion" && (
                      <button
                        onClick={() => {
                          setSelectedDate(selectedDayForDetails);
                          setShowDayDetailsModal(false);
                          setShowBookingModal(true);
                        }}
                        className="bg-primary text-white px-8 py-3.5 text-[11px] font-black rounded-2xl shadow-xl shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.2em]"
                      >
                        Agendar Carga
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Confirmation Modal - Always at the Root for Accessibility during Login Errors */}
      <AnimatePresence>
        {showConfirmModal && confirmConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-[3rem] border border-border shadow-soft p-10 animate-fade-up">
              <div className="flex flex-col items-center gap-6 mb-10 text-center">
                <div className={`p-6 rounded-3xl border-2 ${
                  confirmConfig.type === 'danger' 
                    ? 'bg-red-50 border-red-100 text-red-500' 
                    : 'bg-primary/5 border-primary/10 text-primary'
                }`}>
                  {confirmConfig.type === 'danger' ? <AlertTriangle className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black text-text uppercase tracking-tighter leading-none">{confirmConfig.title}</h3>
                  <p className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-4 leading-relaxed opacity-70">{confirmConfig.message}</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => { confirmConfig.onConfirm(); setShowConfirmModal(false); }}
                  className={`w-full py-5 rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] shadow-xl transition-all hover:scale-[1.02] active:scale-95 text-white ${
                    confirmConfig.type === 'danger' 
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
                      : 'bg-primary hover:bg-primary/90 shadow-primary/30'
                  }`}
                >
                  {confirmConfig.confirmLabel || 'Confirmar'}
                </button>
                {confirmConfig.showCancel !== false && (
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="w-full py-5 text-[12px] font-black uppercase tracking-[0.2em] text-text-muted hover:text-text hover:bg-gray-100 rounded-2xl transition-all"
                  >
                    Regresar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContactModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-[3rem] border border-border shadow-soft overflow-hidden animate-fade-up">
              <div className="p-8 border-b border-border flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-2xl font-black text-text uppercase tracking-tighter">Centro de Ayuda</h3>
                  <p className="text-[11px] font-black text-primary uppercase tracking-[0.4em] mt-1.5 opacity-80">Soporte Técnico Especializado</p>
                </div>
                <button onClick={() => setShowContactModal(false)} className="p-3 bg-white/80 hover:bg-gray-200 rounded-2xl transition-all text-text-muted hover:text-text active:scale-90">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8 space-y-4">
                <a href="mailto:soporte@galipote.com" className="flex items-center gap-6 p-6 bg-white hover:bg-primary/5 rounded-[2rem] border border-border hover:border-primary/30 transition-all group shadow-sm">
                  <div className="p-4 bg-primary/10 text-primary rounded-2xl border border-primary/20 group-hover:scale-110 transition-all duration-300">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-text-muted uppercase tracking-widest mb-1 italic opacity-60">Soporte Express</p>
                    <p className="text-lg font-black text-text tracking-tight group-hover:text-primary transition-colors">soporte@galipote.com</p>
                  </div>
                </a>
                <a href="tel:+18295550123" className="flex items-center gap-6 p-6 bg-white hover:bg-emerald-50 rounded-[2rem] border border-border hover:border-emerald-300 transition-all group shadow-sm">
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 group-hover:scale-110 transition-all duration-300">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-text-muted uppercase tracking-widest mb-1 italic opacity-60">Línea Directa</p>
                    <p className="text-lg font-black text-text tracking-tight group-hover:text-emerald-600 transition-colors">+1 (829) 555-0123</p>
                  </div>
                </a>
                <button 
                  onClick={() => setShowContactModal(false)}
                  className="w-full mt-6 py-5 bg-gray-100 hover:bg-gray-200 text-text-muted rounded-[1.5rem] font-black uppercase tracking-[0.3em] transition-all border border-border text-[11px]"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
