# 🚀 Roadmap: AGENDAO SB1 - Optimización Logística SAP

Este documento detalla los pasos críticos para completar el desarrollo de **AGENDAO SB1**, asegurando una integración fluida con SAP Business One y una experiencia de usuario premium siguiendo las directrices de diseño avanzado.

## 📌 Visión General
La aplicación se divide en dos pilares fundamentales:
1.  **Gestión de Unidades (Camiones):** Control proactivo de disponibilidad y reservas internas.
2.  **Monitoreo de Recibos (Orden de Compra SAP):** Visibilidad automática de entradas basadas en datos reales de SAP B1.

---

## ✅ Fase 1: Estabilización y Diseño Core (Completado)
- [x] **Restauración de Integridad:** Limpieza de `App.tsx` y eliminación de errores de sintaxis.
- [x] **Design Tokens:** Implementación de tipografía *Outfit*, Glassmorphism y sombras premium.
- [x] **UI Responsiva:** Adaptación para móviles y Escritorio (Header optimizado y touch targets de 48px).
- [x] **Infraestructura Supabase:** Configuración de `supabase-js`, Auth Login híbrido y Realtime DB.

## ✅ Fase 2: Disponibilidad Avanzada & UX Detalle (Completado)
- [x] **Lógica de Conflictos:** Querys de Supabase con validación de solapamiento en milisegundos.
- [x] **Indicador de Carga:** Visualización en el calendario de la disponibilidad diaria del camión (Libre/Medio/Ocupado).
- [x] **Detalle en Móvil:** Implementación de vistas de detalle mejoradas (Bottom Sheets) para evitar navegación profunda.
- [x] **Filtros Rápidos:** Capacidad de filtrar el calendario por unidad de transporte específica.

## 📦 Fase 3: Integración SAP B1 (Agenda de Recibo)
- [ ] **Sincronización de OC:** Configurar el endpoint para traer Ordenes de Compra (`OPCH` o `POR1`) desde el Service Layer.
- [ ] **Mapeo de Fechas:** Vincular el campo `DocDueDate` (Fecha de vencimiento/entrega prevista) al calendario de recibos.
- [ ] **Filtros Inteligentes:** Mostrar solo órdenes abiertas o relevantes para el equipo de almacén.
- [ ] **Vista de Lectura:** Asegurar que el calendario de recibos sea claro y diferencie visualmente los tipos de mercancía.

## 💫 Fase 4: Autenticación Supabase y Refinamiento
- [ ] **Sesión Persistente:** Migrar el login actual a Supabase Auth para mantener sesiones activas y seguras.
- [ ] **Sistema de Toasts:** Migrar alertas de éxito temporales a notificaciones tipo "Toast" para no interrumpir el flujo.
- [ ] **Modos de Visualización:** Añadir vista de lista/agenda para usuarios que prefieren ver las tareas del día.
- [ ] **Optimización de Carga:** Skeletons de carga integrados con los estados de Supabase.

---

## 🛠️ Tecnologías Utilizadas
- **Frontend:** React + TypeScript + Tailwind CSS.
- **Backend/Auth/Realtime:** Supabase (PostgreSQL).
- **Integración ERP:** SAP Service Layer (Service Layer API).
- **Animaciones:** Framer Motion.

---
> [!IMPORTANT]
> **Nota de Diseño:** Todo cambio debe respetar el principio de "Simplicidad Poderosa" y los estándares de accesibilidad WCAG 2.2.
