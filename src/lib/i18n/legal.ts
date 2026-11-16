import type { Lang } from "./core";

/**
 * Privacy policy and terms of use, in the three app languages. Kept out of the t() dictionaries
 * because they are long documents, not UI strings. `{contact}` is replaced with CONTACT_EMAIL.
 * This is a starting template: the operator must review it (name, legal entity, contact) before launch.
 */
export interface LegalDoc { title: string; updated: string; intro: string; sections: Array<{ h: string; p: string[] }> }

export const LEGAL_UPDATED = "2026-11-16";

export const privacy: Record<Lang, LegalDoc> = {
  ro: {
    title: "Politica de confidențialitate",
    updated: "Ultima actualizare",
    intro: "TeachFlow este o platformă pentru profesori independenți, elevii lor și părinții elevilor. Aici explicăm ce date prelucrăm, de ce și ce drepturi ai.",
    sections: [
      { h: "Cine răspunde de date", p: [
        "Pentru contul tău și funcționarea platformei, operatorul este TeachFlow. Pentru datele elevilor introduse de un profesor (fișa elevului, notițe, note, plăți), profesorul decide ce introduce și de ce; TeachFlow le prelucrează în numele lui.",
        "Ne poți scrie la {contact}."
      ] },
      { h: "Ce date prelucrăm", p: [
        "Date de cont: nume, email, parolă (stocată criptat), limba, fusul orar și poza de profil, dacă o adaugi.",
        "Date de lucru: elevi, cursuri, lecții, teme și fișiere, mesaje, plăți și facturi, teste și rezultate, puncte și insigne.",
        "Date tehnice: jurnale de server, informații despre dispozitiv pentru notificări push și cookie-uri strict necesare (sesiune, limbă, temă). Nu folosim cookie-uri de publicitate sau de urmărire."
      ] },
      { h: "De ce le prelucrăm", p: [
        "Ca să furnizăm serviciul pe care l-ai cerut (contract): orar, lecții online, teme, mesaje, plăți, rapoarte.",
        "Ca să trimitem emailuri și notificări legate de cont (memento-uri, facturi, rapoarte lunare pentru părinți), pe care le poți opri din setări.",
        "Ca să păstrăm platforma sigură și să respectăm obligațiile legale."
      ] },
      { h: "Cui le transmitem", p: [
        "Folosim furnizori care prelucrează date doar la instrucțiunile noastre: Supabase (bază de date, autentificare, fișiere), Vercel (găzduire), Resend (emailuri) și, când profesorul folosește „Teste AI”, Anthropic (generarea întrebărilor din textul trimis). Unii dintre ei pot prelucra date în afara Republicii Moldova și a UE, cu garanții contractuale.",
        "Nu vindem date și nu le folosim pentru reclame."
      ] },
      { h: "Cât timp le păstrăm", p: [
        "Cât timp contul este activ. Când ștergi contul, datele și fișierele lui sunt șterse imediat din aplicație; copiile de siguranță ale furnizorilor se rotesc în cel mult 30 de zile.",
        "Datele unui elev pot fi șterse oricând de profesorul lui."
      ] },
      { h: "Drepturile tale", p: [
        "Ai dreptul de acces, rectificare, ștergere, restricționare, portabilitate și opoziție, conform Legii nr. 133/2011 privind protecția datelor cu caracter personal și, unde se aplică, GDPR.",
        "Din aplicație poți descărca toate datele tale („Descarcă datele mele”) și îți poți șterge contul („Șterge contul”). Pentru altceva, scrie-ne la {contact}. Poți depune și o plângere la Centrul Național pentru Protecția Datelor cu Caracter Personal."
      ] },
      { h: "Copii", p: [
        "Conturile de elev pentru copii sub 16 ani se creează doar prin invitația profesorului, cu acordul părintelui sau al tutorelui. Părintele poate urmări contul copilului și poate cere ștergerea datelor."
      ] },
      { h: "Securitate", p: [
        "Datele sunt transmise criptat (HTTPS), accesul la fiecare rând din baza de date este limitat la cine are dreptul să-l vadă, iar fișierele sunt private."
      ] },
      { h: "Modificări", p: [
        "Dacă schimbăm această politică, actualizăm data de mai sus și, pentru schimbări importante, te anunțăm în aplicație sau pe email."
      ] }
    ]
  },
  ru: {
    title: "Политика конфиденциальности",
    updated: "Последнее обновление",
    intro: "TeachFlow — платформа для независимых преподавателей, их учеников и родителей. Здесь мы объясняем, какие данные обрабатываем, зачем и какие у вас права.",
    sections: [
      { h: "Кто отвечает за данные", p: [
        "За ваш аккаунт и работу платформы отвечает TeachFlow. За данные учеников, которые вносит преподаватель (карточка ученика, заметки, оценки, платежи), решения принимает преподаватель; TeachFlow обрабатывает их от его имени.",
        "Напишите нам: {contact}."
      ] },
      { h: "Какие данные мы обрабатываем", p: [
        "Данные аккаунта: имя, email, пароль (хранится в зашифрованном виде), язык, часовой пояс и фото профиля, если вы его добавили.",
        "Рабочие данные: ученики, курсы, уроки, домашние задания и файлы, сообщения, платежи и счета, тесты и результаты, баллы и значки.",
        "Технические данные: серверные журналы, сведения об устройстве для push-уведомлений и строго необходимые cookie (сессия, язык, тема). Рекламные и отслеживающие cookie мы не используем."
      ] },
      { h: "Зачем мы их обрабатываем", p: [
        "Чтобы предоставлять сервис, который вы заказали (договор): расписание, онлайн-уроки, задания, сообщения, платежи, отчёты.",
        "Чтобы отправлять письма и уведомления по аккаунту (напоминания, счета, ежемесячные отчёты для родителей); их можно отключить в настройках.",
        "Чтобы поддерживать безопасность платформы и выполнять требования закона."
      ] },
      { h: "Кому мы их передаём", p: [
        "Мы пользуемся подрядчиками, которые обрабатывают данные только по нашим инструкциям: Supabase (база данных, вход, файлы), Vercel (хостинг), Resend (письма) и, когда преподаватель использует «AI-тесты», Anthropic (составление вопросов по отправленному тексту). Некоторые из них могут обрабатывать данные за пределами Республики Молдова и ЕС с договорными гарантиями.",
        "Мы не продаём данные и не используем их для рекламы."
      ] },
      { h: "Как долго мы их храним", p: [
        "Пока аккаунт активен. Когда вы удаляете аккаунт, его данные и файлы сразу удаляются из приложения; резервные копии у подрядчиков обновляются не дольше 30 дней.",
        "Данные ученика его преподаватель может удалить в любой момент."
      ] },
      { h: "Ваши права", p: [
        "Вы имеете право на доступ, исправление, удаление, ограничение обработки, переносимость и возражение согласно Закону № 133/2011 о защите персональных данных и, где применимо, GDPR.",
        "В приложении можно скачать все свои данные («Скачать мои данные») и удалить аккаунт («Удалить аккаунт»). По другим вопросам пишите на {contact}. Вы также можете подать жалобу в Национальный центр по защите персональных данных."
      ] },
      { h: "Дети", p: [
        "Аккаунты учеников младше 16 лет создаются только по приглашению преподавателя и с согласия родителя или опекуна. Родитель может следить за аккаунтом ребёнка и просить удалить данные."
      ] },
      { h: "Безопасность", p: [
        "Данные передаются в зашифрованном виде (HTTPS), доступ к каждой строке базы данных есть только у тех, кому он положен, а файлы закрыты."
      ] },
      { h: "Изменения", p: [
        "Если мы изменим политику, мы обновим дату выше, а о важных изменениях сообщим в приложении или по email."
      ] }
    ]
  },
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    intro: "TeachFlow is a platform for independent teachers, their students and the students' parents. This page explains what data we process, why, and what your rights are.",
    sections: [
      { h: "Who is responsible", p: [
        "TeachFlow is the controller for your account and for running the platform. For student data a teacher enters (student card, notes, grades, payments), the teacher decides what to enter and why; TeachFlow processes it on the teacher's behalf.",
        "You can write to us at {contact}."
      ] },
      { h: "What we process", p: [
        "Account data: name, email, password (stored hashed), language, time zone and profile photo if you add one.",
        "Work data: students, courses, lessons, homework and files, messages, payments and invoices, quizzes and results, points and badges.",
        "Technical data: server logs, device details for push notifications and strictly necessary cookies (session, language, theme). We use no advertising or tracking cookies."
      ] },
      { h: "Why", p: [
        "To provide the service you asked for (contract): timetable, online lessons, homework, messages, payments, reports.",
        "To send account emails and notifications (reminders, invoices, monthly parent reports), which you can turn off in settings.",
        "To keep the platform secure and meet legal obligations."
      ] },
      { h: "Who we share it with", p: [
        "We use providers that process data only on our instructions: Supabase (database, sign-in, files), Vercel (hosting), Resend (email) and, when a teacher uses \"AI quizzes\", Anthropic (writing questions from the text sent). Some of them may process data outside Moldova and the EU, under contractual safeguards.",
        "We do not sell data or use it for advertising."
      ] },
      { h: "How long we keep it", p: [
        "As long as the account is active. When you delete your account, its data and files are removed from the app at once; provider backups rotate within 30 days.",
        "A student's data can be deleted by their teacher at any time."
      ] },
      { h: "Your rights", p: [
        "You have the right of access, rectification, erasure, restriction, portability and objection under Moldovan Law No. 133/2011 on personal data protection and, where it applies, the GDPR.",
        "In the app you can download all your data (\"Download my data\") and delete your account (\"Delete account\"). For anything else, write to {contact}. You can also complain to the National Center for Personal Data Protection."
      ] },
      { h: "Children", p: [
        "Student accounts for children under 16 are created only through the teacher's invite, with the consent of a parent or guardian. The parent can follow the child's account and ask for the data to be deleted."
      ] },
      { h: "Security", p: [
        "Data travels encrypted (HTTPS), every database row can only be read by those allowed to see it, and files are private."
      ] },
      { h: "Changes", p: [
        "If we change this policy we update the date above and, for important changes, tell you in the app or by email."
      ] }
    ]
  }
};

export const terms: Record<Lang, LegalDoc> = {
  ro: {
    title: "Termeni de utilizare",
    updated: "Ultima actualizare",
    intro: "Folosind TeachFlow, accepți termenii de mai jos. Dacă nu ești de acord, te rugăm să nu folosești platforma.",
    sections: [
      { h: "Serviciul", p: [
        "TeachFlow oferă profesorilor un spațiu de lucru pentru elevi, orar, lecții online, teme, mesaje, plăți și rapoarte, iar elevilor și părinților un portal legat de profesorul lor."
      ] },
      { h: "Contul", p: [
        "Ești responsabil pentru datele de autentificare și pentru ce se întâmplă în contul tău. Datele din cont trebuie să fie reale.",
        "Conturile de elev și de părinte se creează prin invitația profesorului. Pentru minori, invitația se acceptă cu acordul părintelui sau al tutorelui."
      ] },
      { h: "Responsabilitățile profesorului", p: [
        "Profesorul introduce date despre elevi doar dacă are dreptul să o facă și îi informează pe elevi sau pe părinți despre folosirea TeachFlow.",
        "Facturile generate de TeachFlow sunt documente de evidență și nu înlocuiesc documentele fiscale pe care profesorul trebuie să le emită conform legii."
      ] },
      { h: "Utilizare corectă", p: [
        "Nu folosi platforma pentru conținut ilegal, ofensator sau care încalcă drepturile altora, nu încerca să accesezi date care nu îți aparțin și nu perturba funcționarea serviciului."
      ] },
      { h: "Abonamente", p: [
        "Planul gratuit are limitele afișate pe pagina de abonamente. Planurile plătite se activează după confirmarea plății și nu se reînnoiesc automat; la expirare, contul revine la planul gratuit, fără pierderea datelor."
      ] },
      { h: "Conținutul tău", p: [
        "Conținutul pe care îl încarci rămâne al tău. Ne dai doar permisiunea necesară ca să-l stocăm și să-l afișăm celor cu care îl partajezi în platformă.",
        "Poți descărca oricând datele și îți poți șterge contul din setări."
      ] },
      { h: "Disponibilitate și răspundere", p: [
        "Facem tot posibilul ca serviciul să fie disponibil și sigur, dar îl oferim „așa cum este”. În limita permisă de lege, nu răspundem pentru pierderi indirecte. Păstrează copii ale documentelor importante."
      ] },
      { h: "Încetare", p: [
        "Poți înceta oricând folosirea serviciului ștergându-ți contul. Putem suspenda conturile care încalcă acești termeni, după o notificare, cu excepția cazurilor grave."
      ] },
      { h: "Legea aplicabilă și contact", p: [
        "Acești termeni sunt guvernați de legislația Republicii Moldova. Întrebări: {contact}."
      ] }
    ]
  },
  ru: {
    title: "Условия использования",
    updated: "Последнее обновление",
    intro: "Пользуясь TeachFlow, вы принимаете условия ниже. Если вы не согласны, пожалуйста, не пользуйтесь платформой.",
    sections: [
      { h: "Сервис", p: [
        "TeachFlow даёт преподавателям рабочее пространство для учеников, расписания, онлайн-уроков, заданий, сообщений, платежей и отчётов, а ученикам и родителям — портал, связанный с их преподавателем."
      ] },
      { h: "Аккаунт", p: [
        "Вы отвечаете за свои данные для входа и за действия в вашем аккаунте. Данные аккаунта должны быть достоверными.",
        "Аккаунты учеников и родителей создаются по приглашению преподавателя. За несовершеннолетних приглашение принимается с согласия родителя или опекуна."
      ] },
      { h: "Обязанности преподавателя", p: [
        "Преподаватель вносит данные об учениках, только если имеет на это право, и сообщает ученикам или родителям, что пользуется TeachFlow.",
        "Счета, которые формирует TeachFlow, служат для учёта и не заменяют фискальные документы, которые преподаватель обязан выдавать по закону."
      ] },
      { h: "Честное использование", p: [
        "Не используйте платформу для незаконного, оскорбительного или нарушающего чужие права контента, не пытайтесь получить доступ к чужим данным и не мешайте работе сервиса."
      ] },
      { h: "Подписки", p: [
        "У бесплатного плана есть ограничения, указанные на странице подписок. Платные планы включаются после подтверждения оплаты и не продлеваются автоматически; по окончании аккаунт возвращается на бесплатный план без потери данных."
      ] },
      { h: "Ваш контент", p: [
        "Загруженный вами контент остаётся вашим. Вы даёте нам только разрешение, необходимое, чтобы хранить его и показывать тем, с кем вы делитесь им на платформе.",
        "Вы можете в любой момент скачать данные и удалить аккаунт в настройках."
      ] },
      { h: "Доступность и ответственность", p: [
        "Мы делаем всё, чтобы сервис был доступным и безопасным, но предоставляем его «как есть». В пределах, разрешённых законом, мы не отвечаем за косвенные убытки. Храните копии важных документов."
      ] },
      { h: "Прекращение", p: [
        "Вы можете в любой момент прекратить пользоваться сервисом, удалив аккаунт. Мы можем приостановить аккаунты, нарушающие эти условия, после предупреждения, кроме серьёзных случаев."
      ] },
      { h: "Применимое право и контакты", p: [
        "Эти условия регулируются законодательством Республики Молдова. Вопросы: {contact}."
      ] }
    ]
  },
  en: {
    title: "Terms of use",
    updated: "Last updated",
    intro: "By using TeachFlow you accept the terms below. If you do not agree, please do not use the platform.",
    sections: [
      { h: "The service", p: [
        "TeachFlow gives teachers a workspace for students, timetable, online lessons, homework, messages, payments and reports, and gives students and parents a portal linked to their teacher."
      ] },
      { h: "Your account", p: [
        "You are responsible for your sign-in details and for what happens in your account. Account details must be accurate.",
        "Student and parent accounts are created through the teacher's invite. For minors, the invite is accepted with the consent of a parent or guardian."
      ] },
      { h: "The teacher's responsibilities", p: [
        "A teacher enters student data only when entitled to, and tells students or parents that TeachFlow is used.",
        "Invoices generated by TeachFlow are records and do not replace the tax documents a teacher must issue by law."
      ] },
      { h: "Fair use", p: [
        "Do not use the platform for illegal or offensive content or content that infringes others' rights, do not try to reach data that is not yours, and do not disrupt the service."
      ] },
      { h: "Subscriptions", p: [
        "The free plan has the limits shown on the plans page. Paid plans start once payment is confirmed and do not renew automatically; when one ends, the account returns to the free plan without losing data."
      ] },
      { h: "Your content", p: [
        "Content you upload stays yours. You give us only the permission needed to store it and show it to the people you share it with on the platform.",
        "You can download your data and delete your account from settings at any time."
      ] },
      { h: "Availability and liability", p: [
        "We do our best to keep the service available and secure, but provide it \"as is\". As far as the law allows, we are not liable for indirect losses. Keep copies of important documents."
      ] },
      { h: "Ending", p: [
        "You can stop using the service at any time by deleting your account. We may suspend accounts that break these terms, after a notice, except in serious cases."
      ] },
      { h: "Governing law and contact", p: [
        "These terms are governed by the laws of the Republic of Moldova. Questions: {contact}."
      ] }
    ]
  }
};
