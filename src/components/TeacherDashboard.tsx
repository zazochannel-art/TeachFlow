"use client";

import React, { useState } from 'react';
import { 
  Bell, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  GraduationCap, 
  Home, 
  MessageCircle, 
  Music, 
  Palette, 
  Plus, 
  Search, 
  Users, 
  Video 
} from 'lucide-react';

export default function TeacherDashboard() {
  const [activeNav, setActiveNav] = useState('Aktivität');

  const classes = [
    {
      id: '3B',
      bells: 4,
      homeworks: '56%',
      students: 26,
      bg: 'bg-[#152266]',
      avatars: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      ],
    },
    {
      id: '3C',
      bells: 2,
      homeworks: '95%',
      students: 28,
      bg: 'bg-[#21358C]',
      avatars: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
      ],
    },
    {
      id: '2A',
      bells: 1,
      homeworks: '50%',
      students: 27,
      bg: 'bg-[#324BB6]',
      avatars: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80',
      ],
    },
    {
      id: '2B',
      bells: 5,
      homeworks: '80%',
      students: 21,
      bg: 'bg-[#4663DF]',
      avatars: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&auto=format&fit=crop&q=80',
      ],
    },
  ];

  const schedule = [
    { time: '8:00', title: 'Kunst 2B', interval: '8:00 - 8:45', active: false },
    { time: '9:00', title: 'Musik 2B', interval: '9:05 - 9:50', active: true, tag: 'Jetzt' },
    { time: '10:00', title: 'Kunst 3B', interval: '10:00 - 10:45', active: false },
    { time: '11:00', title: 'Kunst 1B', interval: '11:00 - 11:45', active: false },
    { time: '12:00', title: 'Kunst 2B', interval: '12:05 - 12:50', active: false },
    { time: '13:00', title: 'Musik 2B', interval: '13:05 - 13:50', active: false },
  ];

  const navItems = [
    { label: 'Aktivität', icon: Bell },
    { label: 'Chat', icon: MessageCircle },
    { label: 'Klassen', icon: Users },
    { label: 'Kalendar', icon: Calendar },
    { label: 'Lektionen', icon: Video },
    { label: 'Unterlagen', icon: FileText },
    { label: 'Noten', icon: FileText },
    { label: 'Schulbesuch', icon: Calendar },
  ];

  return (
    <div className="min-h-screen w-full bg-[#C9D2F8] flex items-center justify-center p-4 lg:p-10 font-sans select-none">
      {/* Rama exterioară de tabletă */}
      <div className="w-full max-w-[1380px] bg-[#E2E8FC] p-3.5 rounded-[44px] shadow-2xl">
        {/* Ecranul interior */}
        <div className="w-full bg-[#F5F7FD] rounded-[34px] flex overflow-hidden min-h-[820px] shadow-inner">
          
          {/* SIDEBAR STÂNGA */}
          <aside className="w-[88px] bg-[#111960] flex flex-col items-center py-7 text-white shrink-0 rounded-l-[30px]">
            {/* Tocă absolvire */}
            <div className="mb-8 text-[#5773FA]">
              <GraduationCap className="w-9 h-9 fill-[#5773FA]/30 stroke-[1.8]" />
            </div>

            {/* Navigație */}
            <nav className="flex-1 w-full flex flex-col items-center space-y-3 pl-2">
              {navItems.map((item) => {
                const isActive = activeNav === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() => setActiveNav(item.label)}
                    className={`w-full py-3 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#5B78FA] text-white rounded-l-[24px] shadow-md'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center">
                      <item.icon className="w-4 h-4 fill-current" />
                    </div>
                    <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* CONȚINUT DREAPTA (Header + Grid) */}
          <div className="flex-1 flex flex-col px-9 py-7">
            
            {/* TOP HEADER */}
            <header className="flex items-center justify-between mb-8">
              {/* Selector dată */}
              <div className="flex items-center space-x-3.5">
                <button className="w-5 h-5 rounded-full bg-[#252B42] text-white flex items-center justify-center hover:opacity-80 cursor-pointer">
                  <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <h1 className="text-[17px] text-[#252B42] tracking-tight">
                  <strong className="font-extrabold">Montag</strong>, 22 März 2021
                </h1>
                <button className="w-5 h-5 rounded-full bg-[#252B42] text-white flex items-center justify-center hover:opacity-80 cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <button className="w-8 h-8 rounded-full border border-slate-300/80 flex items-center justify-center text-[#252B42] ml-1 hover:bg-white cursor-pointer">
                  <Calendar className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Capsula dublă Musik 2B + Profil Wiebke */}
              <div className="flex items-center bg-white rounded-2xl shadow-xs h-[54px] overflow-hidden">
                {/* Partea albastră */}
                <div className="bg-[#5671F5] h-full px-5 flex items-center space-x-4 text-white rounded-r-2xl">
                  <span className="text-xs font-bold tracking-wide">Musik 2B</span>
                  <div className="w-9 h-9 rounded-full border border-white/40 bg-white/15 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                      <Video className="w-3.5 h-3.5 text-[#5671F5] fill-[#5671F5]" />
                    </div>
                  </div>
                </div>

                {/* Partea albă */}
                <div className="flex items-center space-x-5 px-5 text-[#252B42]">
                  <button className="hover:opacity-70 cursor-pointer">
                    <Search className="w-4 h-4 stroke-[2.2]" />
                  </button>
                  <div className="h-5 w-[1px] bg-slate-200" />
                  <button className="hover:opacity-70 cursor-pointer">
                    <Bell className="w-4 h-4 fill-[#252B42]" />
                  </button>
                  <div className="flex items-center space-x-3 pl-1">
                    <span className="text-xs font-extrabold text-[#252B42]">Wiebke</span>
                    <img
                      src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80"
                      alt="Wiebke"
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </header>

            {/* CORP PRINCIPAL: STÂNGA (Clase + Notificări/Taskuri) & DREAPTA (Stundenplan) */}
            <div className="flex-1 grid grid-cols-12 gap-8">
              
              {/* COLOANA STÂNGA-CENTRU (8 coloane) */}
              <div className="col-span-8 flex flex-col justify-between">
                
                {/* IHRE KLASSEN */}
                <div>
                  <h2 className="text-[15px] font-extrabold text-[#252B42] mb-4">Ihre Klassen</h2>
                  <div className="grid grid-cols-5 gap-4">
                    {classes.map((cls) => (
                      <div
                        key={cls.id}
                        className={`${cls.bg} rounded-[20px] p-4 text-white flex flex-col justify-between h-[138px] shadow-md hover:translate-y-[-2px] transition-transform cursor-pointer`}
                      >
                        <div className="text-[22px] font-extrabold leading-none">{cls.id}</div>

                        <div className="flex items-center justify-between text-[11px] font-medium text-white/90 my-1">
                          <span className="flex items-center gap-1.5">
                            <Bell className="w-3.5 h-3.5 fill-white" /> {cls.bells}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Home className="w-3.5 h-3.5 fill-white" /> {cls.homeworks}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex -space-x-2">
                            <img
                              src={cls.avatars[0]}
                              alt="student"
                              className="w-7 h-7 rounded-full object-cover ring-2 ring-white/20"
                            />
                            <img
                              src={cls.avatars[1]}
                              alt="student"
                              className="w-7 h-7 rounded-full object-cover ring-2 ring-white/20"
                            />
                          </div>
                          <div className="text-[10px] leading-tight text-white/90">
                            <strong className="block font-bold text-white text-[11px]">{cls.students}</strong>
                            Studenten
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Card Erstelle eine neue Klasse */}
                    <button className="bg-[#E6ECFA] hover:bg-[#dce4f7] rounded-[20px] p-4 h-[138px] flex flex-col items-center justify-center text-[#252B42] transition-colors cursor-pointer">
                      <Plus className="w-5 h-5 mb-2 stroke-[2.2]" />
                      <span className="text-[11px] font-semibold text-center leading-snug text-[#3B4254]">
                        Erstelle eine<br />neue Klasse
                      </span>
                    </button>
                  </div>
                </div>

                {/* BENACHRICHTUNGEN & HEUTE ZU ERLEDIGEN */}
                <div className="grid grid-cols-2 gap-6 mt-7 flex-1">
                  
                  {/* Benachrichtigungen */}
                  <div>
                    <h2 className="text-[15px] font-extrabold text-[#252B42] mb-4">Benachrichtigungen</h2>
                    <div className="space-y-3.5">
                      {/* Card albastru activ */}
                      <div className="bg-[#5B78FA] text-white p-4 rounded-[20px] flex items-center gap-4 shadow-md shadow-blue-500/15">
                        <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                          <Video className="w-5 h-5 fill-white text-white" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <p className="text-white/90">Unterrichtszeit!</p>
                          <p>
                            <strong className="font-extrabold">Musik 2b</strong> um 9:05 Uhr <strong className="font-extrabold">im Gange</strong>
                          </p>
                        </div>
                      </div>

                      {/* Kunst 3C */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="w-11 h-11 rounded-full bg-[#EAEEFD] flex items-center justify-center shrink-0">
                          <Palette className="w-5 h-5 text-[#324BB6] fill-[#324BB6]/20" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Kunst 3C</h4>
                          <p className="text-slate-500">
                            <strong className="font-extrabold text-[#252B42]">50%</strong> der Hausaufgaben erledigt
                          </p>
                        </div>
                      </div>

                      {/* Kunst 2B */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="w-11 h-11 rounded-full bg-[#EAEEFD] flex items-center justify-center shrink-0">
                          <Palette className="w-5 h-5 text-[#324BB6] fill-[#324BB6]/20" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Kunst 2B</h4>
                          <p className="text-slate-500">
                            <strong className="font-extrabold text-[#252B42]">75%</strong> der Hausaufgaben erledigt
                          </p>
                        </div>
                      </div>

                      {/* Musik 2B */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="w-11 h-11 rounded-full bg-[#EAEEFD] flex items-center justify-center shrink-0">
                          <Music className="w-5 h-5 text-[#324BB6]" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Musik 2B</h4>
                          <p className="text-slate-500">
                            <strong className="font-extrabold text-[#252B42]">25%</strong> der Hausaufgaben erledigt
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Heute zu erledigen */}
                  <div>
                    <h2 className="text-[15px] font-extrabold text-[#252B42] mb-4">Heute zu erledigen</h2>
                    <div className="space-y-3.5">
                      {/* Marcus & Wiebke */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="relative shrink-0">
                          <img
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                            alt="Parent"
                            className="w-11 h-11 rounded-full object-cover"
                          />
                          <div className="w-5 h-5 rounded-full bg-[#324BB6] text-white flex items-center justify-center absolute -bottom-0.5 -right-1 ring-2 ring-white">
                            <Video className="w-2.5 h-2.5 fill-white" />
                          </div>
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Marcus & Wiebke, Klaus Ruhe</h4>
                          <p className="text-slate-500">Videogespräch mit Eltern</p>
                        </div>
                      </div>

                      {/* Kunst 3C */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="w-11 h-11 rounded-full bg-[#EAEEFD] flex items-center justify-center shrink-0">
                          <Palette className="w-5 h-5 text-[#324BB6] fill-[#324BB6]/20" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Kunst 3C</h4>
                          <p className="text-slate-500">
                            <strong className="font-extrabold text-[#252B42]">5</strong> Hausaufgaben nachprüfen
                          </p>
                        </div>
                      </div>

                      {/* Musik 3C */}
                      <div className="bg-white p-4 rounded-[20px] flex items-center gap-4 shadow-2xs">
                        <div className="w-11 h-11 rounded-full bg-[#EAEEFD] flex items-center justify-center shrink-0">
                          <Music className="w-5 h-5 text-[#324BB6]" />
                        </div>
                        <div className="text-xs leading-relaxed">
                          <h4 className="font-extrabold text-[#252B42]">Musik 3C</h4>
                          <p className="text-slate-500">
                            <strong className="font-extrabold text-[#252B42]">Kapitel 9</strong> Prüfung vorbereiten
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* COLOANA DREAPTA: STUNDENPLAN (4 coloane) */}
              <div className="col-span-4 flex flex-col">
                <h2 className="text-[15px] font-extrabold text-[#252B42] mb-4">Stundenplan</h2>
                
                {/* Cardul alb mare al orarului */}
                <div className="bg-white rounded-[26px] p-5 flex-1 shadow-2xs relative flex">
                  <div className="flex-1 space-y-3.5 pr-3">
                    {schedule.map((slot, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <span className="text-[11px] text-slate-400 w-9 pt-2 font-medium shrink-0">
                          {slot.time}
                        </span>

                        <div
                          className={`flex-1 rounded-[18px] px-4 py-3 ${
                            slot.active
                              ? 'bg-[#5671F5] text-white shadow-md shadow-blue-500/20'
                              : 'bg-[#F6F8FD] text-[#252B42]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-extrabold">{slot.title}</span>
                            {slot.tag && (
                              <span className="text-[10px] text-white/80 font-medium">{slot.tag}</span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] mt-0.5 ${
                              slot.active ? 'text-white/80' : 'text-slate-400'
                            }`}
                          >
                            {slot.interval}
                          </p>

                          {slot.active && (
                            <div className="mt-3 flex justify-end">
                              <button className="border border-white/80 hover:bg-white/10 text-white text-[11px] font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-colors cursor-pointer">
                                <Video className="w-3.5 h-3.5 fill-white" />
                                <span>Den Unterricht starten</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bara de scroll decorativă ca în poză */}
                  <div className="w-1.5 bg-[#F1F4FB] rounded-full my-2 shrink-0">
                    <div className="w-full h-36 bg-[#E2E7F5] rounded-full" />
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
