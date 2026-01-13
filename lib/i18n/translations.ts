export type SupportedLanguage = "he" | "ru";

export const supportedLanguages: Record<SupportedLanguage, string> = {
  he: "עברית",
  ru: "русский",
};

type TranslationRecord = {
  he: string;
  ru: string;
};

export const translations = {
  "app.tagline": {
    he: "מערכת רצפת ייצור מחוברת",
    ru: "Цифровая система контроля производства",
  },
  "app.cta": {
    he: "התחברות",
    ru: "Войти",
  },
  "home.hero.title": {
    he: "ברוכים הבאים למערכת הבקרה של רצפת הייצור",
    ru: "Добро пожаловать в систему контроля производства",
  },
  "home.hero.description": {
    he: "תהליך ההזדהות, בחירת העמדה וניהול המשמרת ייבנו כאן צעד אחר צעד. כעת אנו מתמקדים בהקמת הבסיס ל-RTL, עברית ורוסית ושכבת עיצוב נקייה לכל המסכים.",
    ru: "Здесь шаг за шагом строится поток входа, выбора станка и ведения смены. Сейчас мы настраиваем основу RTL, поддержку иврита и русского и чистый интерфейс для всех экранов.",
  },
  "home.section.workers.title": {
    he: "עובדי הייצור",
    ru: "Производственные работники",
  },
  "home.section.workers.description": {
    he: "בקרוב ניתן יהיה להזדהות עם מספר עובד, לבחור עמדה ולהתחיל פק\"ע עם צ׳ק-ליסט פתיחה מובנה.",
    ru: "Скоро можно будет войти по номеру сотрудника, выбрать станок и запустить заказ со стартовым чек-листом.",
  },
  "home.section.screens.title": {
    he: "מסכי שליטה",
    ru: "Экраны управления",
  },
  "home.section.screens.description": {
    he: "מסך העבודה החי יכלול טיימר, סטטוסים, דיווחי ייצור ותקלות — הכל בהתאם לחוקי RTL ולתרגומים.",
    ru: "Рабочий экран покажет таймер, статусы, отчёты по производству и неисправности — с поддержкой RTL и переводов.",
  },
  "home.cta.login": {
    he: "כניסה למשמרת",
    ru: "Перейти к смене",
  },
  "home.cta.learnMore": {
    he: "הכירו את המסכים",
    ru: "Узнать о экранах",
  },
  "home.flow.title": {
    he: "מסלול המשמרת",
    ru: "Путь смены",
  },
  "home.flow.subtitle": {
    he: "שלושה מסכים מסודרים שמלווים את העובד מהזדהות ועד סיום.",
    ru: "Три последовательных экрана ведут сотрудника от входа до завершения смены.",
  },
  "common.back": {
    he: "חזרה",
    ru: "Назад",
  },
  "common.next": {
    he: "המשך",
    ru: "Далее",
  },
  "common.confirm": {
    he: "אישור",
    ru: "Подтвердить",
  },
  "common.cancel": {
    he: "ביטול",
    ru: "Отмена",
  },
  "common.language": {
    he: "שפת ממשק",
    ru: "Язык интерфейса",
  },
  "common.worker": {
    he: "עובד",
    ru: "Работник",
  },
  "common.station": {
    he: "עמדה",
    ru: "Станок",
  },
  "common.job": {
    he: "פק\"ע",
    ru: "Заказ",
  },
  "login.title": {
    he: "כניסה למשמרת",
    ru: "Вход на смену",
  },
  "login.subtitle": {
    he: "הזינו מספר עובד ובחרו שפה מועדפת",
    ru: "Введите табельный номер и выберите язык",
  },
  "login.workerIdLabel": {
    he: "מספר עובד",
    ru: "Табельный номер",
  },
  "login.workerIdPlaceholder": {
    he: "לדוגמה: 4582",
    ru: "Например: 4582",
  },
  "login.languageLabel": {
    he: "שפה",
    ru: "Язык",
  },
  "login.submit": {
    he: "כניסה למשמרת",
    ru: "Начать смену",
  },
  "login.error.notFound": {
    he: "לא נמצא עובד פעיל עם המספר שסיפקתם.",
    ru: "Активный работник с таким номером не найден.",
  },
  "login.error.required": {
    he: "נא להזין מספר עובד.",
    ru: "Введите табельный номер.",
  },
  "station.title": {
    he: "בחירת עמדה",
    ru: "Выбор станка",
  },
  "station.subtitle": {
    he: "בחרו את המכונה שעליה אתם עובדים במשמרת זו.",
    ru: "Выберите станок, на котором будете работать.",
  },
  "station.empty": {
    he: "לא הוגדרו עמדות עבור העובד הזה.",
    ru: "Для этого работника не назначены станки.",
  },
  "station.loading": {
    he: "טוען עמדות...",
    ru: "Загрузка списка станков...",
  },
  "station.error.load": {
    he: "אירעה שגיאה בטעינת העמדות. נסו שוב.",
    ru: "Не удалось загрузить список станков. Попробуйте ещё раз.",
  },
  "station.continue": {
    he: "התחלת עבודה",
    ru: "Начать работу",
  },
  "station.creating": {
    he: "יוצר עבודה...",
    ru: "Создание работы...",
  },
  "station.error.occupied": {
    he: "העמדה תפוסה על ידי עובד אחר.",
    ru: "Станок занят другим работником.",
  },
  "station.error.sessionFailed": {
    he: "לא ניתן ליצור עבודה כעת. נסו שוב.",
    ru: "Не удалось создать работу. Попробуйте ещё раз.",
  },
  "station.error.jobNotConfigured": {
    he: "פק\"ע לא מוגדר לייצור",
    ru: "Заказ не настроен для производства",
  },
  "station.error.jobNotConfiguredDesc": {
    he: "הפק\"ע הזה עדיין לא הוגדר עם תחנות או קווי ייצור. פנו למנהל להגדרת הפק\"ע.",
    ru: "Этот заказ ещё не настроен со станциями или производственными линиями. Обратитесь к администратору для настройки заказа.",
  },
  "station.error.selectAnotherJob": {
    he: "בחר פק\"ע אחר",
    ru: "Выбрать другой заказ",
  },
  "station.error.jobItemNotFound": {
    he: "לא נמצא פריט ייצור מתאים לתחנה זו",
    ru: "Не найден подходящий элемент производства для этой станции",
  },
  "station.resume.bannerTitle": {
    he: "נמצאה עבודה פעילה",
    ru: "Найдена активная работа",
  },
  "station.resume.bannerSubtitle": {
    he: "לפני שתבחרו עמדה חדשה יש להחליט אם ממשיכים בעבודה או סוגרים אותה.",
    ru: "Перед выбором нового станка нужно решить: продолжить работу или закрыть её.",
  },
  "station.resume.title": {
    he: "חזרה לעבודה פעילה",
    ru: "Возобновить активную работу",
  },
  "station.resume.subtitle": {
    he: "בחרו אם להמשיך מהמקום בו עצרתם או לסגור ולהתחיל מחדש.",
    ru: "Выберите: продолжить с того же места или закрыть и начать новую.",
  },
  "station.resume.countdown": {
    he: "העבודה תיסגר אוטומטית בעוד {{time}}",
    ru: "Работа закроется автоматически через {{time}}",
  },
  "station.resume.station": {
    he: "עמדה פעילה",
    ru: "Текущий станок",
  },
  "station.resume.stationFallback": {
    he: "לא נמצאה עמדה",
    ru: "Станок не найден",
  },
  "station.resume.job": {
    he: "פק\"ע פעיל",
    ru: "Текущий заказ",
  },
  "station.resume.jobFallback": {
    he: "לא נמצא פק\"ע",
    ru: "Заказ не найден",
  },
  "station.resume.elapsed": {
    he: "זמן עבודה עד כה",
    ru: "Прошедшее время",
  },
  "station.resume.resume": {
    he: "חזרה לעבודה",
    ru: "Вернуться к работе",
  },
  "station.resume.discard": {
    he: "סגירת העבודה והתחלה חדשה",
    ru: "Закрыть и начать новую",
  },
  "station.resume.discarding": {
    he: "סוגר עבודה...",
    ru: "Закрываю работу...",
  },
  "station.resume.error": {
    he: "הפעולה נכשלה, נסו שוב.",
    ru: "Не удалось выполнить действие. Попробуйте ещё раз.",
  },
  "station.resume.missing": {
    he: "לא נמצאו פרטי עמדה או פק\"ע לחזרה.",
    ru: "Нет данных по станку или заказу для возобновления.",
  },
  "station.field.type": {
    he: "סוג עמדה",
    ru: "Тип станка",
  },
  "station.selected": {
    he: "נבחר",
    ru: "Выбрано",
  },
  "station.occupied.by": {
    he: "בשימוש ע\"י {{name}}",
    ru: "Используется: {{name}}",
  },
  "station.occupied.gracePeriod": {
    he: "בהמתנה",
    ru: "Ожидание",
  },
  "station.type.prepress": {
    he: "קדם דפוס",
    ru: "Препресс",
  },
  "station.type.digital_press": {
    he: "דפוס דיגיטלי",
    ru: "Цифровая печать",
  },
  "station.type.offset": {
    he: "דפוס אופסט",
    ru: "Офсет",
  },
  "station.type.folding": {
    he: "קיפול",
    ru: "Фальцовка",
  },
  "station.type.cutting": {
    he: "חיתוך",
    ru: "Резка",
  },
  "station.type.binding": {
    he: "כריכה",
    ru: "Склейка",
  },
  "station.type.shrink": {
    he: "שרינק",
    ru: "Усадка",
  },
  "station.type.lamination": {
    he: "למינציה",
    ru: "Ламинация",
  },
  "station.type.other": {
    he: "אחר",
    ru: "Другое",
  },
  "station.productionLine": {
    he: "קו ייצור",
    ru: "Производственная линия",
  },
  "station.singleStation": {
    he: "תחנה בודדת",
    ru: "Отдельная станция",
  },
  "station.stationCount": {
    he: "{{count}} תחנות",
    ru: "{{count}} станций",
  },
  "station.plannedQuantity": {
    he: "{{count}} יח׳ מתוכננות",
    ru: "{{count}} ед. запланировано",
  },
  "station.notAssigned": {
    he: "לא משויך אליך",
    ru: "Не назначено вам",
  },
  "station.terminal": {
    he: "תחנה סופית",
    ru: "Конечная станция",
  },
  "station.available": {
    he: "פנוי",
    ru: "Свободно",
  },
  "station.occupied": {
    he: "תפוס",
    ru: "Занято",
  },
  "station.gracePeriod": {
    he: "תקופת חסד",
    ru: "Период ожидания",
  },
  "station.noStations": {
    he: "אין תחנות להצגה",
    ru: "Нет станций для отображения",
  },
  "station.noJobItems": {
    he: "אין פריטי עבודה מוגדרים לעבודה זו",
    ru: "Для этого заказа не определены рабочие элементы",
  },
  "station.noAssignedStations": {
    he: "אין לך תחנות משויכות לעבודה זו",
    ru: "У вас нет назначенных станций для этого заказа",
  },
  "job.title": {
    he: "פתיחת פק\"ע",
    ru: "Выбор заказа",
  },
  "job.subtitle": {
    he: "הזינו פק\"ע קיים או צרו חדש.",
    ru: "Введите номер заказа или создайте новый.",
  },
  "job.numberLabel": {
    he: "מספר פק\"ע",
    ru: "Номер заказа",
  },
  "job.numberPlaceholder": {
    he: "לדוגמה: 105432",
    ru: "Например: 105432",
  },
  "job.submit": {
    he: "המשך לבחירת עמדה",
    ru: "Перейти к выбору станка",
  },
  "job.error.required": {
    he: "נא להזין מספר פק\"ע.",
    ru: "Введите номер заказа.",
  },
  "job.error.generic": {
    he: "לא ניתן לפתוח את הפק\"ע כעת. נסו שוב.",
    ru: "Не удалось открыть заказ. Попробуйте ещё раз.",
  },
  "job.error.notFound": {
    he: "מספר עבודה לא קיים במערכת. יש ליצור עבודה חדשה דרך מערכת הניהול.",
    ru: "Номер заказа не найден в системе. Создайте заказ через систему управления.",
  },
  "checklist.start.title": {
    he: "צ'ק-ליסט פתיחה",
    ru: "Стартовый чек-лист",
  },
  "checklist.end.title": {
    he: "צ'ק ליסט סגירה",
    ru: "Финишный чек-лист",
  },
  "checklist.start.subtitle": {
    he: "סמנו את כל הסעיפים הנדרשים לפני תחילת הייצור.",
    ru: "Отметьте все обязательные пункты перед запуском.",
  },
  "checklist.end.subtitle": {
    he: "סיכום ובדיקת סיום לפני סגירת הפק\"ע.",
    ru: "Проверьте и подтвердите завершение заказа.",
  },
  "checklist.submit": {
    he: "שמירה והמשך",
    ru: "Сохранить и продолжить",
  },
  "checklist.empty": {
    he: "לא הוגדר צ'ק-ליסט עבור סוג עמדה זה.",
    ru: "Для этого станка чек-лист не настроен.",
  },
  "checklist.loading": {
    he: "טוען צ'ק-ליסט...",
    ru: "Загрузка чек-листа...",
  },
  "checklist.required": {
    he: "יש להשלים את כל הסעיפים המסומנים כחובה.",
    ru: "Необходимо выполнить все обязательные пункты.",
  },
  "checklist.item.required": {
    he: "חובה",
    ru: "Обязательно",
  },
  "checklist.error.submit": {
    he: "לא ניתן לשמור את הצ'ק-ליסט. נסו שוב.",
    ru: "Не удалось сохранить чек-лист. Попробуйте ещё раз.",
  },
  "checklist.scrap.dialog.title": {
    he: "דיווח פסולים",
    ru: "Отчёт о браке",
  },
  "checklist.scrap.dialog.description": {
    he: "כמות הפסולים חרגה מהסף המותר. נא לתת הסבר.",
    ru: "Количество брака превысило допустимый порог. Пожалуйста, объясните.",
  },
  "checklist.scrap.dialog.count": {
    he: "פסולים בעבודה זו",
    ru: "брака в этой работе",
  },
  "checklist.scrap.dialog.notePlaceholder": {
    he: "הסבירו את הסיבה לכמות הפסולים הגבוהה...",
    ru: "Объясните причину большого количества брака...",
  },
  "checklist.scrap.dialog.submit": {
    he: "שליחת דיווח והמשך",
    ru: "Отправить отчёт и продолжить",
  },
  "checklist.scrap.dialog.warning": {
    he: "יש לשלוח דיווח על הפסולים לפני סיום המשמרת.",
    ru: "Необходимо отправить отчёт о браке перед завершением смены.",
  },
  "checklist.scrap.submitted": {
    he: "הדיווח נשלח",
    ru: "Отчёт отправлен",
  },
  "checklist.scrap.required": {
    he: "חובה",
    ru: "Обязательно",
  },
  "checklist.scrap.count": {
    he: "כמות פסולים",
    ru: "Кол-во брака",
  },
  "checklist.scrap.fillReport": {
    he: "מלא דיווח פסולים",
    ru: "Заполнить отчёт о браке",
  },
  "sessionTransferred.title": {
    he: "המשמרת הועברה",
    ru: "Сессия перенесена",
  },
  "sessionTransferred.subtitle": {
    he: "המשמרת שלך פעילה בחלון אחר",
    ru: "Ваша сессия активна в другом окне",
  },
  "sessionTransferred.cardTitle": {
    he: "המשמרת הועברה לחלון אחר",
    ru: "Сессия перенесена в другое окно",
  },
  "sessionTransferred.description": {
    he: "פתחת את המשמרת בחלון או מכשיר אחר. כדי להמשיך לעבוד, השתמש בחלון הפעיל.",
    ru: "Вы открыли сессию в другом окне или устройстве. Для продолжения работы используйте активное окно.",
  },
  "sessionTransferred.goToLogin": {
    he: "חזרה לכניסה",
    ru: "Вернуться к входу",
  },
  "work.title": {
    he: "מסך עבודה חי",
    ru: "Экран выполнения заказа",
  },
  "work.timer": {
    he: "משך פעילות",
    ru: "Длительность",
  },
  "work.section.status": {
    he: "סטטוסי עבודה",
    ru: "Статусы работы",
  },
  "work.section.production": {
    he: "דיווח יצור",
    ru: "Отчёт по производству",
  },
  "work.section.actions": {
    he: "פעולות נוספות",
    ru: "Дополнительные действия",
  },
  "work.status.instructions": {
    he: "בחרו את מצב העבודה הנוכחי.",
    ru: "Выберите текущий статус работы.",
  },
  "work.actions.instructions": {
    he: "פעולות זמינות למשמרת הנוכחית.",
    ru: "Доступные действия текущей смены.",
  },
  "work.status.setup": {
    he: "כיוונים",
    ru: "Наладка",
  },
  "work.status.production": {
    he: "ייצור",
    ru: "Производство",
  },
  "work.status.stopped": {
    he: "עצירה",
    ru: "Останов",
  },
  "work.status.fault": {
    he: "תקלה",
    ru: "Неисправность",
  },
  "work.status.waiting": {
    he: "המתנה ללקוח",
    ru: "Ожидание клиента",
  },
  "work.status.plateChange": {
    he: "שינוי גלופות",
    ru: "Смена форм",
  },
  "work.counters.good": {
    he: "במות תקינה",
    ru: "Годные изделия",
  },
  "work.counters.scrap": {
    he: "כמות פסולה",
    ru: "Брак",
  },
  "work.actions.reportFault": {
    he: "דיווח תקלה",
    ru: "Сообщить о неисправности",
  },
  "work.actions.finish": {
    he: "סיום עבודה",
    ru: "Завершить работу",
  },
  "work.actions.finishWarning": {
    he: "הלחיצה תעביר אתכם לצ'ק ליסט סגירה ותסגור את הפק\"ע.",
    ru: "Нажатие переведёт вас к финальному чек-листу и закроет заказ.",
  },
  "work.dialog.fault.title": {
    he: "דיווח תקלה",
    ru: "Сообщение о неисправности",
  },
  "work.dialog.fault.reason": {
    he: "סיבת התקלה",
    ru: "Причина неисправности",
  },
  "work.dialog.fault.note": {
    he: "הערות נוספות",
    ru: "Дополнительные сведения",
  },
  "work.dialog.fault.image": {
    he: "צילום (אופציונלי)",
    ru: "Фото (по желанию)",
  },
  "work.dialog.fault.imagePlaceholder": {
    he: "אפשר לצרף תמונה לזיהוי התקלה (אופציונלי).",
    ru: "Прикрепите фото для фиксации неисправности (необязательно).",
  },
  "work.error.status": {
    he: "לא ניתן לעדכן סטטוס כעת.",
    ru: "Не удалось обновить статус.",
  },
  "work.error.production": {
    he: "לא ניתן לעדכן כמויות כרגע.",
    ru: "Не удалось обновить количества.",
  },
  "work.error.wipDownstreamConsumed": {
    he: "לא ניתן להקטין כמות - היא כבר נצרכה בתחנה הבאה.",
    ru: "Нельзя уменьшить количество — оно уже использовано на следующей станции.",
  },
  "work.error.fault": {
    he: "לא ניתן לשמור את דיווח התקלה.",
    ru: "Не удалось сохранить сообщение о неисправности.",
  },
  "work.dialog.fault.submit": {
    he: "שמירת דיווח",
    ru: "Сохранить отчёт",
  },
  "work.dialog.fault.submitAndChangeStatus": {
    he: "דווח והחלף סטטוס",
    ru: "Отправить и изменить статус",
  },
  "work.dialog.report.title": {
    he: "דיווח מצב",
    ru: "Отчёт о состоянии",
  },
  "work.dialog.report.reason": {
    he: "סיבת הדיווח",
    ru: "Причина отчёта",
  },
  "work.dialog.report.note": {
    he: "הערות נוספות",
    ru: "Дополнительные сведения",
  },
  "work.dialog.report.image": {
    he: "צילום (אופציונלי)",
    ru: "Фото (по желанию)",
  },
  "work.dialog.report.imagePlaceholder": {
    he: "אפשר לצרף תמונה לתיעוד (אופציונלי).",
    ru: "Прикрепите фото для документирования (необязательно).",
  },
  "work.dialog.report.submit": {
    he: "שמירת דיווח",
    ru: "Сохранить отчёт",
  },
  "work.dialog.report.submitAndChangeStatus": {
    he: "דווח והחלף סטטוס",
    ru: "Отправить и изменить статус",
  },
  "work.error.report": {
    he: "לא ניתן לשמור את הדיווח.",
    ru: "Не удалось сохранить отчёт.",
  },
  "work.dialog.finish.title": {
    he: "לאשר סיום משמרת?",
    ru: "Завершить смену?",
  },
  "work.dialog.finish.description": {
    he: "סיום המשמרת ינעל את הדיווחים ויעביר אתכם לצ'ק-ליסט הסיום.",
    ru: "Завершение смены закроет отчёты и переведёт к финальному чек-листу.",
  },
  "work.dialog.finish.confirm": {
    he: "מעבר לצ'ק ליסט סגירה",
    ru: "Перейти к финальному чек-листу",
  },
  // Production Pipeline
  "work.pipeline.upstream": {
    he: "תחנה קודמת",
    ru: "Предыдущая станция",
  },
  "work.pipeline.downstream": {
    he: "תחנה הבאה",
    ru: "Следующая станция",
  },
  "work.pipeline.available": {
    he: "זמין לשליפה",
    ru: "Доступно",
  },
  "work.pipeline.waiting": {
    he: "ממתין",
    ru: "Ожидает",
  },
  "work.pipeline.firstStation": {
    he: "תחנה ראשונה",
    ru: "Первая станция",
  },
  "work.pipeline.lastStation": {
    he: "תחנה סופית",
    ru: "Последняя станция",
  },
  "work.pipeline.singleStation": {
    he: "עמדה בודדת",
    ru: "Отдельная станция",
  },
  "work.pipeline.collapse": {
    he: "צמצם",
    ru: "Свернуть",
  },
  "work.pipeline.expand": {
    he: "לחץ להרחבה",
    ru: "Нажмите для раскрытия",
  },
  "work.pipeline.flowTitle": {
    he: "זרימת קו ייצור",
    ru: "Поток производственной линии",
  },
  "work.pipeline.output": {
    he: "תפוקה",
    ru: "Выход",
  },
  "work.pipeline.noStation": {
    he: "אין תחנה",
    ru: "Нет станции",
  },
  "work.pipeline.quantityHint": {
    he: "הכמויות יוזנו בעת יציאה מייצור",
    ru: "Количество будет введено при выходе из производства",
  },
  "summary.completed": {
    he: "הפק\"ע נסגר בהצלחה.",
    ru: "Заказ успешно закрыт.",
  },
  "summary.newSession": {
    he: "חזרה לבחירת עמדה",
    ru: "Вернуться к выбору станка",
  },
} satisfies Record<string, TranslationRecord>;

export type TranslationKey = keyof typeof translations;

export const DEFAULT_LANGUAGE: SupportedLanguage = "he";
const FALLBACK_LANGUAGE: SupportedLanguage = "he";

export function getTranslation(
  key: TranslationKey,
  language: SupportedLanguage,
): string {
  const entry = translations[key];
  if (!entry) {
    return key;
  }

  return entry[language] ?? entry[FALLBACK_LANGUAGE] ?? key;
}

