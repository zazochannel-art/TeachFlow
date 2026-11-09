"use client";

import React, { useState } from 'react';
import { 
  Bell, 
  Calendar, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  GraduationCap, 
  Layers, 
  MessageSquare, 
  Music, 
  Palette, 
  Plus, 
  Search, 
  Users, 
  Video,
  X
} from 'lucide-react';

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState('Activitate');
  const [classes, setClasses] = useState([
    { id: '3B', badgeCount: 4, progress: '56%', students: 26, color: 'from-[#1E295E] to-[#2A3B8F]' },
    { id: '3C', badgeCount: 2, progress: '95%', students: 28, color: 'from-[#233575] to-[#344CB7]' },
    { id: '2A', badgeCount: 1, progress: '50%', students: 27, color: 'from-[#2B4294] to-[#3B59CE]' },
    { id: '2B', badgeCount: 5, progress: '80%', students: 21, color: 'from-[#3B59CE] to-[#4F70F5]' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassStudents, setNewClassStudents] = useState('20');

  const schedule = [
    { time: '8:00', title: 'Artă Plastică 2B', interval: '8:00 - 8:45', active: false },
    { time: '9:00', title: 'Muzică 2B', interval: '9:05 - 9:50', active: true, badge: 'Acum' },
    { time: '10:00', title: 'Artă Plastică 3B', interval: '10:00 - 10:45', active: false },
    { time: '11:00', title: 'Artă Plastică 1B', interval: '11:00 - 11:45', active: false },
    { time: '12:00', title: 'Artă Plastică 2B', interval: '12:05 - 12:50', active: false },
    { time: '13:00', title: 'Muzică 2B', interval: '13:05 - 13:50', active: false },
  ];

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setClasses([
      ...classes,
      {
        id: newClassName.toUpperCase(),
        badgeCount: 0,
        progress: '0%',
        students: parseInt(newClassStudents, 10) || 15,
        color: 'from-[#3B59CE] to-[#4F70F5]',
      },
    ]);
    setNewClassName('');
    setIsModalOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-[#DCE4F7] font-sans text-slate-800 overflow-hidden p-3 sm:p-5">
      <div className="flex w-full h-full bg-[#F5F7FD] rounded-[32px] shadow-2xl overflow-hidden border border-white/80">
        
        {/* 1. SIDEBAR STÂNGA */}
        <aside className="w-24 bg-[#19204E] flex flex-col items-center py-6 text-white select-none shrink-0">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-8 text-blue-300 shadow-inner">
            <GraduationCap className="w-7 h-7" />
          </div>

          <nav className="flex-1 flex flex-col space-y-3 w-full px-2 overflow-y-auto">
            {[
              { icon: Bell, label: 'Activitate' },
              { icon: MessageSquare, label: 'Chat' },
              { icon: Users, label: 'Clase' },
              { icon: Calendar, label: 'Calendar' },
              { icon: Video, label: 'Lecții' },
              { icon: FileText, label: 'Materiale' },
              { icon: Layers, label: 'Note' },
              { icon: CheckCircle2, label: 'Prezență' },
            ].map((item) => {
              const isActive = activeTab === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveTab(item.label)}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all text-[11px] gap-1 cursor-pointer ${
                    isActive 
                      ? 'bg-[#4D69FA] text-white shadow-lg shadow-blue-600/30 font-semibold' 
                      : 'text-indigo-200/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* 2. ZONA CENTRALĂ */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 lg:p-8">
          {/* Header Dată */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <button className="w-7 h-7 rounded-full bg-slate-800 text-white shadow-sm flex items-center justify-center hover:bg-slate-700 cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">
                <span className="font-extrabold">Luni</span>, 9 Noiembrie 2026
              </h1>
              <button className="w-7 h-7 rounded-full bg-slate-800 text-white shadow-sm flex items-center justify-center hover:bg-slate-700 cursor-pointer">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 border border-slate-200/60 ml-1 cursor-pointer">
                <Calendar className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Clasele Mele */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-slate-800 mb-4">Clasele tale</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {classes.map((c) => (
                <div 
                  key={c.id} 
                  className={`bg-gradient-to-b ${c.color} p-4 rounded-2xl text-white shadow-md flex flex-col justify-between h-36 hover:scale-[1.02] transition-transform cursor-pointer`}
                >
                  <div>
                    <span className="text-2xl font-extrabold tracking-tight">{c.id}</span>
                    <div className="flex items-center space-x-3 text-xs text-blue-100/90 mt-2">
                      <span className="flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> {c.badgeCount}</span>
                      <span className="font-semibold">{c.progress}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="flex -space-x-2 overflow-hidden">
                      <div className="w-7 h-7 rounded-full bg-amber-300 ring-2 ring-indigo-900 flex items-center justify-center text-[10px] text-slate-900 font-bold">A</div>
                      <div className="w-7 h-7 rounded-full bg-emerald-300 ring-2 ring-indigo-900 flex items-center justify-center text-[10px] text-slate-900 font-bold">M</div>
                    </div>
                    <span className="text-[11px] text-blue-100 font-medium leading-tight text-right">
                      <strong className="block text-white text-xs">{c.students}</strong> elevi
                    </span>
                  </div>
                </div>
              ))}

              {/* Card Adăugare Clasă */}
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-[#E6ECFA] hover:bg-[#DCE5F8] rounded-2xl flex flex-col items-center justify-center text-slate-700 h-36 transition-colors p-4 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2 text-slate-700">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-center leading-snug text-slate-600">
                  Creează o<br />clasă nouă
                </span>
              </button>
            </div>
          </section>

          {/* Notificări & De rezolvat azi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Notificări */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">Notificări</h2>
              <div className="space-y-3">
                <div className="bg-[#5671F5] text-white p-4 rounded-2xl shadow-md shadow-blue-500/15 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-100 font-medium">Ora de curs!</p>
                    <p className="text-sm font-semibold">
                      <strong className="font-extrabold">Muzică 2B</strong> la ora 9:05 <strong className="underline">în desfășurare</strong>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FC] flex items-center justify-center text-[#3B59CE] shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Artă Plastică 3C</h4>
                    <p className="text-xs text-slate-500"><strong className="text-slate-800">50%</strong> din teme au fost rezolvate</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FC] flex items-center justify-center text-[#3B59CE] shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Artă Plastică 2B</h4>
                    <p className="text-xs text-slate-500"><strong className="text-slate-800">75%</strong> din teme au fost rezolvate</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FC] flex items-center justify-center text-[#3B59CE] shrink-0">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Muzică 2B</h4>
                    <p className="text-xs text-slate-500"><strong className="text-slate-800">25%</strong> din teme au fost rezolvate</p>
                  </div>
                </div>
              </div>
            </section>

            {/* De rezolvat azi */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">De rezolvat azi</h2>
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-slate-800">
                      MR
                    </div>
                    <div className="w-5 h-5 rounded-full bg-[#3B59CE] text-white flex items-center justify-center absolute -bottom-1 -right-1 ring-2 ring-white">
                      <Video className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Marcus & Elena, familia Rusu</h4>
                    <p className="text-xs text-slate-500">Apel video cu părinții</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FC] flex items-center justify-center text-[#3B59CE] shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Artă Plastică 3C</h4>
                    <p className="text-xs text-slate-500"><strong className="text-slate-800">5 teme</strong> de verificat</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#EEF2FC] flex items-center justify-center text-[#3B59CE] shrink-0">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Muzică 3C</h4>
                    <p className="text-xs text-slate-500"><strong className="text-slate-800">Capitolul 9</strong> Pregătire evaluare</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* 3. COLOANA DREAPTA – ORAR */}
        <aside className="w-80 lg:w-96 bg-[#F5F7FD] border-l border-slate-200/60 p-6 flex flex-col shrink-0 overflow-y-auto">
          {/* Top Bar Profil & Status */}
          <div className="flex items-center justify-between mb-8 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
            <div className="bg-[#5671F5] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-2.5 shadow-sm">
              <span>Muzică 2B</span>
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <Video className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <div className="flex items-center space-x-3 pr-2 text-slate-700">
              <button className="hover:text-blue-600 cursor-pointer"><Search className="w-4 h-4" /></button>
              <button className="hover:text-blue-600 relative cursor-pointer">
                <Bell className="w-4 h-4" />
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full absolute -top-0.5 -right-0.5"></span>
              </button>
              <div className="flex items-center space-x-2 pl-1">
                <span className="text-xs font-bold text-slate-800">Viorica</span>
                <div className="w-8 h-8 rounded-full bg-amber-200 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-800">
                  V
                </div>
              </div>
            </div>
          </div>

          <h2 className="text-base font-bold text-slate-800 mb-4">Orar</h2>

          {/* Container alb pentru cronologia orelor */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex-1 space-y-4">
            {schedule.map((item, idx) => (
              <div key={idx} className="flex items-start space-x-3">
                <span className="text-[11px] text-slate-400 font-medium w-9 pt-2 shrink-0">{item.time}</span>
                
                <div className={`flex-1 rounded-2xl p-3.5 transition-all ${
                  item.active 
                    ? 'bg-[#5671F5] text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-[#F8FAFC] text-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold">{item.title}</span>
                    {item.badge && (
                      <span className="text-[10px] text-blue-100 font-medium">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] ${item.active ? 'text-blue-100' : 'text-slate-400'}`}>
                    {item.interval}
                  </p>

                  {item.active && (
                    <button className="mt-3 w-full bg-[#425CE8] hover:bg-[#364FD4] border border-white/40 text-white font-semibold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer">
                      <Video className="w-3.5 h-3.5" />
                      <span>Începe lecția</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

      </div>

      {/* Modal Adăugare Clasă Nouă */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800">Creează o clasă nouă</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Indicativ clasă (ex: 4A)</label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="4A"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Număr de elevi</label>
                <input
                  type="number"
                  value={newClassStudents}
                  onChange={(e) => setNewClassStudents(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#4D69FA] hover:bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Salvează clasa
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
