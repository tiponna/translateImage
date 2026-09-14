"use client";

import {
  Home,
  History,
  Star,
  Settings,
  HelpCircle,
  Languages,
} from "lucide-react";

const NAV = [
  { icon: Home, label: "หน้าหลัก", active: true },
  { icon: History, label: "ประวัติการแปล", active: false },
  { icon: Star, label: "รายการโปรด", active: false },
  { icon: Settings, label: "ตั้งค่า", active: false },
  { icon: HelpCircle, label: "ช่วยเหลือ", active: false },
];

export default function Sidebar() {
  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-sm">
          A文
        </div>
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Image Translator
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-300">แปลภาษาจากรูปภาพ</p>
        </div>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            type="button"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active
                ? "bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/30 dark:text-blue-200"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mx-3 mb-3 rounded-xl border border-blue-100 bg-linear-to-b from-blue-50 to-white p-3.5 dark:border-blue-900/40 dark:from-blue-950/20 dark:to-slate-900">
        <div className="mb-2 flex items-center gap-2">
          <Languages className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Free Plan</span>
        </div>
        <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-300">ใช้งานแล้ว 3/10 ครั้ง</p>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-[30%] rounded-full bg-blue-500" />
        </div>
        <button
          type="button"
          className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white transition hover:bg-blue-700"
        >
          Upgrade
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5 dark:border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
          U
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">ผู้ใช้</p>
          <p className="truncate text-[11px] text-slate-400 dark:text-slate-300">user@example.com</p>
        </div>
      </div>
    </aside>
  );
}
