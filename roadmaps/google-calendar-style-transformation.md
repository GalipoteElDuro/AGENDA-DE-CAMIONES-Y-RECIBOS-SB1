# Google Calendar Style Transformation Plan

## Overview
Transform the current truck/receipt agenda interface to match the Google Calendar Dark Mode layout and interaction patterns shown in the target image. We will maintain the existing accent colors (primary blue `#1e40af`, success green `#10b981`, warning amber `#f59e0b`, danger red `#ef4444`) but adapt the UI to a deep dark theme.

---

## Phase 1: Layout Restructure

### 1.1 Main Layout Grid
**Current:** Single-column container with max-w-7xl
**Target:** Full-width flex layout with sidebar + main calendar area

**Changes:**
- Remove `max-w-7xl mx-auto` from main container
- Create new grid structure:
  - **Left Sidebar:** Fixed width (256px / 16rem), collapsible
  - **Main Calendar:** Flex-1, taking remaining space
- Add border-right to sidebar (`border-r border-border-main`)

### 1.2 Sidebar Structure
**Add these sections (top to bottom):**

1. **"Create" Button** (top-left, below logo)
   - Primary blue button with "+" icon
   - Opens new booking creation modal
   - Position: `mb-6`

2. **Mini Calendar Widget**
   - Compact month view (similar to current but smaller)
   - Navigation arrows (< >) to change months
   - Click day to jump to that date in main view
   - Highlight today with blue circle background
   - Position: `mb-2`

3. **"Search for people" Input**
   - Rounded input with search icon (🔍)
   - Background matching sidebar secondary color
   - Position: `mb-6`

4. **"Booking pages" Section**

   - Text "Booking pages" with a plus icon (+)
   - Position: `mb-6`

4. **"My Calendars" Section** (accordion)
   - Checkboxes to toggle visibility:
     - ✅ Trucks (blue checkbox)
     - ✅ Receipts (green checkbox)
   - Collapsible with chevron icon

5. **"Other Calendars" Section** (accordion)
   - Additional calendar sources
   - Add button (+) to add new calendars
   - Collapsible

6. **Footer:** Terms - Privacy links (bottom of sidebar)


**Sidebar CSS:**
.sidebar {
  width: 256px;
  height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 1rem;
  background: var(--color-bg-sidebar); /* #1e1e1e */
  border-right: 1px solid var(--color-border-main); /* #3c4043 */
}


---

## Phase 2: Header Redesign

### 2.1 New Header Layout
**Current:** Logo + module tabs + user info
**Target:** Google Calendar style header

**Structure (left to right):**
1. **Hamburger Menu Icon** (☰) - Toggle sidebar visibility
2. **App Logo** - Small, next to hamburger
3. **Navigation Controls:**
   - "Today" button (rounded, outline style)
   - Left/Right arrows (< >) to navigate weeks/months
   - Current month/year display (e.g., "April 2026")
4. **Right side (Icon Set):**
   - Search icon (🔍)
   - Support/Help icon (❓)
   - Settings icon (⚙️)
   - **View Selector:** Dropdown with "Day", "Week", "Month" options (rounded-md with chevron)
   - Notifications icon (🔔)
   - User avatar/profile dropdown (keep existing)


**Header CSS:**
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border-main); /* #3c4043 */
  background: var(--color-bg-main); /* #131313 */
  color: var(--color-text-main); /* #e8eaed */
}


---

## Phase 3: Calendar Grid Transformation

### 3.1 Month View (Agenda de Camiones)

**Current:** 7-column grid with day cells showing bookings inline
**Target:** Google Calendar month grid

**Day Cell Design:**
- Square aspect ratio (aspect-square)
- Minimal day number in top-left corner (font-semibold)
- Today highlighted with blue circle background
- Booking blocks as colored horizontal bars:
  - **Width:** Full cell width with 2px padding
  - **Height:** 24px per booking
  - **Style:** Rounded (rounded-sm), left border (border-l-4)
  - **Colors:** 
    - Libre (Available): Green left border + light green bg
    - Medio (Half): Amber left border + light amber bg
    - Ocupado (Full): Red left border + light red bg
- Max 3-4 visible bookings, show "+2 more" if overflow
- Hover: Slight bg color change (hover:bg-[#202124])


**Grid CSS:**
```css
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid var(--color-border-main);
  border-radius: 8px;
  overflow: hidden;
}

.day-cell {
  min-height: 120px;
  border-right: 1px solid var(--color-border-main);
  border-bottom: 1px solid var(--color-border-main);
  padding: 4px;
}
```

### 3.2 Week View (Agenda de Recibo)

**Target:** Google Calendar week/time grid

**Structure:**
- **Time Column:** Left side, fixed width (60px)
  - Shows time labels (8 AM, 9 AM, 10 AM, etc.)
  - Aligned to hour rows
- **Day Columns:** 6 columns (Mon-Sat), flex-1 each
  - Vertical grid lines separating days
  - Horizontal grid lines for each hour (or 30-min intervals)
- **All-day row:** Top row (optional, for full-day events)

**Booking Display:**
- Absolute positioning within day columns
- Top position = start time (calculated from hour grid)
- Height = duration (end - start)
- Width = 90% of column, centered
- Style: Rounded rectangle with colored left border
- Overlapping bookings: Split column width

**Week Grid CSS:**
```css
.week-grid {
  display: grid;
  grid-template-columns: 60px repeat(6, 1fr);
  overflow-y: auto;
  height: calc(100vh - 200px);
}

.time-column {
  border-right: 1px solid var(--color-border-main);
}

.day-column {
  border-right: 1px solid var(--color-border-main);
  position: relative;
}

.hour-row {
  height: 60px; /* 1 hour = 60px */
  border-bottom: 1px solid var(--color-border-main);
}

.booking-block {
  position: absolute;
  left: 2px;
  right: 2px;
  border-radius: 4px;
  border-left: 3px solid;
  padding: 2px 4px;
  overflow: hidden;
}
```

### 3.3 Day View
**Add new view option:**
- Single day column
- Same time grid as week view
- More detailed booking information visible

---

## Phase 4: Interactive Elements

### 4.1 Booking Creation/Editing

**Current:** Modal with form fields
**Target:** Google Calendar style (keep modal but improve UX)

**Improvements:**
- Click empty time slot → Pre-fill date/time in modal
- Drag to select time range → Create booking with that duration
- Modal style:
  - Rounded-xl with shadow-2xl
  - Slide-up animation from clicked position
  - Form fields: Title, Truck/Receipt selector, Start/End time, Status
  - Color picker for custom booking color (optional)
  - Delete button in corner (if editing)

### 4.2 Navigation

**Add keyboard shortcuts:**
- `T` → Go to Today
- `←` / `→` → Previous/Next day/week/month
- `D` → Switch to Day view
- `W` → Switch to Week view
- `M` → Switch to Month view

**Mouse interactions:**
- Click day → Open day details (mobile) or expand day (desktop)
- Click booking → Open edit modal
- Drag booking → Move to different day/time (future enhancement)
- Double-click empty slot → Create new booking

### 4.3 Current Time Indicator
**Add:**
- Red line crossing the grid at current time
- Red dot on the left time column at the current hour
- Only visible when viewing the current day


---

## Phase 5: Responsive Design

### 5.1 Mobile (< 768px)

**Sidebar:**
- Hidden by default
- Slide-in drawer from left (hamburger menu)
- Backdrop overlay when open

**Calendar:**
- Month view: Maintain 7-column grid, reduce cell height
- Week/Day view: Horizontal scroll, show 3-4 hours at a time
- Time labels: Smaller font, abbreviate (8a, 9a, 10a)

**Bottom Navigation:**
- Keep existing bottom nav
- Add view switcher (Day/Week/Month) as segmented control
- FAB (Floating Action Button) for new booking

### 5.2 Tablet (768px - 1024px)

- Sidebar: Collapsible, 200px width
- Calendar: Full functionality
- Booking blocks: Slightly smaller text

### 5.3 Desktop (> 1024px)

- Sidebar: Always visible, 256px width
- Calendar: Full week view default
- Booking blocks: Show full details (title, time, truck/receipt)

---

## Phase 6: Visual Polish

### 6.1 Typography Updates

**Keep existing fonts (Outfit, Inter) but adjust usage:**
- Day numbers: `font-semibold text-sm`
- Booking titles: `font-medium text-xs` (truncate overflow)
- Time labels: `font-normal text-[0.7rem] text-text-muted` (GMT-04 indicators)
- Headers: Use white text on dark background for clarity


### 6.2 Spacing & Padding

- Reduce overall padding for denser layout
- Calendar cells: `p-1` (was p-4/p-6)
- Booking blocks: `p-1 px-2`
- Sidebar sections: `mb-6` spacing

### 6.3 Shadows & Borders

- Remove heavy shadows (`shadow-lg`, `shadow-premium`)
- Use subtle borders instead: `border border-border-main`
- Rounded corners: `rounded-lg` (was rounded-2xl)
- Cards: Flat design, no elevation unless hovering

### 6.4 Animations

- Keep subtle fade-in for booking blocks
- Smooth transitions for view changes (300ms ease-in-out)
- Sidebar slide animation (200ms)
- Remove heavy scale/bounce animations

---

## Phase 7: Component Architecture Refactoring

### 7.1 Break Down App.tsx

**Create new component files:**

```
src/
  components/
    layout/
      Header.tsx           # Top navigation bar
      Sidebar.tsx          # Left sidebar with mini calendar
      MainContent.tsx      # Calendar grid container
    calendar/
      MonthView.tsx        # 7-column month grid
      WeekView.tsx         # Time-based week grid
      DayView.tsx          # Single day time grid
      DayCell.tsx          # Individual day cell (month view)
      BookingBlock.tsx     # Booking display component
      TimeSlot.tsx         # Time grid row
    modals/
      BookingModal.tsx     # Create/Edit booking form
      DayDetailsModal.tsx  # Day overview (mobile)
    sidebar/
      MiniCalendar.tsx     # Small month picker
      CalendarList.tsx     # My Calendars / Other Calendars
```

### 7.2 State Management

**Keep React hooks but organize better:**
- Extract calendar logic to custom hooks:
  - `useCalendarNavigation()` - handle month/week/day switching
  - `useBookings()` - fetch/manage bookings
  - `useViewMode()` - track current view (day/week/month)
- Move constants to separate file: `src/constants.ts`

---

## Phase 8: Implementation Steps

### Step 1: Refactor App.tsx Structure
1. Create component folder structure
2. Extract Header, Sidebar, MainContent components
3. Update imports in App.tsx
4. Test basic functionality

### Step 2: Implement Sidebar
1. Create Sidebar component with sections
2. Add MiniCalendar widget
3. Implement CalendarList with checkboxes
4. Add collapsible sidebar functionality

### Step 3: Redesign Header
1. Update header layout to Google Calendar style
2. Add navigation controls (Today, arrows, month display)
3. Add view selector dropdown
4. Implement view switching logic

### Step 4: Transform Month View
1. Create MonthView component
2. Redesign DayCell to match Google Calendar
3. Update booking display as colored blocks
4. Add hover/active states

### Step 5: Implement Week View
1. Create WeekView with time grid
2. Add time column with hour labels
3. Implement day columns with vertical/horizontal grid
4. Position booking blocks absolutely based on time

### Step 6: Add Day View
1. Create DayView (similar to WeekView but single column)
2. Show full booking details
3. Add current time indicator

### Step 7: Polish Interactions
1. Add keyboard shortcuts
2. Implement click-to-create bookings
3. Add current time indicator (red line)
4. Smooth view transitions

### Step 8: Responsive Adjustments
1. Test mobile layout
2. Implement sidebar drawer for mobile
3. Adjust grid spacing for small screens
4. Optimize touch targets

### Step 9: Visual Refinements
1. Update typography (reduce font weights)
2. Adjust spacing/padding
3. Remove heavy shadows, add subtle borders
4. Test color contrast with existing palette

### Step 10: Testing & Bug Fixes
1. Cross-browser testing
2. Verify all existing features work
3. Performance optimization (virtual scrolling for long lists)
4. Accessibility audit (keyboard nav, screen readers)

---

## Color Mapping Reference

| Element | Current Color | New Usage (Dark Mode) |
|---------|--------------|-----------|
| Primary Blue | `#1e40af` | Today circle, checkboxes, active highlights (use `#8ab4f8` for dark mode contrast) |
| Success Green | `#10b981` | "Libre" bookings bar |
| Warning Amber | `#f59e0b` | "Medio" bookings bar |
| Danger Red | `#ef4444` | "Ocupado" bookings bar, current time line |
| BG Main | `#131313` | Deep dark background for main area |
| BG Sidebar | `#1e1e1e` | Slightly lighter dark for sidebar and header |
| Text Main | `#e8eaed` | Primary white text |
| Text Muted | `#9aa0a6` | Gray text for time labels and inactive elements |
| Border Main | `#3c4043` | Dark gray grid lines and dividers |


---

## Technical Considerations

### Performance
- Virtualize long booking lists (react-window)
- Memoize calendar calculations (useMemo)
- Debounce resize handlers
- Lazy load components (React.lazy for modals)

### Accessibility
- Maintain keyboard navigation
- Add ARIA labels to calendar grid
- Ensure focus indicators visible
- Screen reader announcements for view changes

### Browser Compatibility
- Test in Chrome, Firefox, Safari, Edge
- Verify CSS Grid support (all modern browsers)
- Fallback for older browsers (flexbox-based layout)

---

## Estimated Timeline

- **Phase 1-3 (Layout + Header + Calendar Grid):** 2-3 days
- **Phase 4-5 (Interactions + Responsive):** 1-2 days
- **Phase 6-7 (Polish + Refactoring):** 2 days
- **Phase 8 (Implementation + Testing):** 2-3 days
- **Total:** 7-10 days

---

## Success Criteria

✅ Layout matches Google Calendar structure (sidebar + main area)
✅ Month view displays bookings as colored blocks
✅ Week view shows time grid with positioned bookings
✅ Navigation controls work (today, arrows, view switcher)
✅ Existing color scheme maintained throughout
✅ All current features functional (create, edit, delete bookings)
✅ Responsive on mobile, tablet, desktop
✅ No console errors, smooth performance
✅ Keyboard navigation working
✅ Cross-browser compatible
