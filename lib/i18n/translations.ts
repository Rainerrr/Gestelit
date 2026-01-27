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
  "common.loading": {
    he: "טוען...",
    ru: "Загрузка...",
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
  // ============================================
  // STATION PAGE - Additional translations
  // ============================================
  "station.tryAgain": {
    he: "נסה שוב",
    ru: "Попробовать снова",
  },
  "station.contactAdmin": {
    he: "פנה למנהל כדי לקבל הרשאות לעמדות",
    ru: "Обратитесь к администратору для получения доступа к станкам",
  },
  "station.noJobsAvailable": {
    he: "אין עבודות זמינות",
    ru: "Нет доступных заказов",
  },
  "station.allStationsEmpty": {
    he: "כל העמדות שלך פנויות אך אין עבודות פעילות",
    ru: "Все ваши станки свободны, но нет активных заказов",
  },
  "station.searchPlaceholder": {
    he: "חיפוש עמדה...",
    ru: "Поиск станка...",
  },
  "station.noStationsFound": {
    he: "לא נמצאו עמדות",
    ru: "Станки не найдены",
  },
  "station.tryDifferentSearch": {
    he: "נסה לחפש עם מילות מפתח אחרות",
    ru: "Попробуйте другие ключевые слова",
  },
  "station.noType": {
    he: "ללא סוג",
    ru: "Без типа",
  },
  "station.availableCount": {
    he: "{{available}} / {{total}} עמדות פנויות",
    ru: "{{available}} / {{total}} станков свободно",
  },
  "station.jobsCount": {
    he: "עבודות",
    ru: "заказов",
  },
  "station.noCategoryStations": {
    he: "אין עמדות בקטגוריה זו",
    ru: "Нет станков в этой категории",
  },
  // ============================================
  // STATION TILE translations
  // ============================================
  "station.tile.disconnected": {
    he: "מנותק",
    ru: "Отключён",
  },
  "station.tile.occupied": {
    he: "תפוס",
    ru: "Занято",
  },
  "station.tile.free": {
    he: "פנוי",
    ru: "Свободно",
  },
  "station.tile.selected": {
    he: "נבחר",
    ru: "Выбрано",
  },
  "station.tile.occupiedStation": {
    he: "עמדה תפוסה",
    ru: "Станок занят",
  },
  // ============================================
  // JOB ITEMS SHEET translations
  // ============================================
  "jobItems.sheet.title": {
    he: "עבודות זמינות בעמדה {{code}}",
    ru: "Доступные заказы на станке {{code}}",
  },
  "jobItems.sheet.activeJobs": {
    he: "{{count}} עבודות פעילות",
    ru: "{{count}} активных заказов",
  },
  "jobItems.sheet.searchPlaceholder": {
    he: "חיפוש לפי מספר עבודה או לקוח...",
    ru: "Поиск по номеру заказа или клиенту...",
  },
  "jobItems.sheet.loadingJobs": {
    he: "טוען עבודות...",
    ru: "Загрузка заказов...",
  },
  "jobItems.sheet.noResults": {
    he: "לא נמצאו תוצאות",
    ru: "Результаты не найдены",
  },
  "jobItems.sheet.noJobsAvailable": {
    he: "אין עבודות זמינות",
    ru: "Нет доступных заказов",
  },
  "jobItems.sheet.tryDifferentSearch": {
    he: "נסה לחפש עם מילות מפתח אחרות",
    ru: "Попробуйте другие ключевые слова",
  },
  "jobItems.sheet.noJobsAssigned": {
    he: "לעמדה זו לא הוקצו עבודות כרגע",
    ru: "Для этого станка сейчас нет назначенных заказов",
  },
  "jobItems.card.job": {
    he: "עבודה {{number}}",
    ru: "Заказ {{number}}",
  },
  "jobItems.card.completed": {
    he: "הושלם",
    ru: "Завершено",
  },
  "jobItems.card.selectJob": {
    he: "בחר עבודה זו",
    ru: "Выбрать этот заказ",
  },
  // ============================================
  // JOB SELECTION SHEET translations
  // ============================================
  "jobSelection.title": {
    he: "בחר עבודה לייצור",
    ru: "Выберите заказ для производства",
  },
  "jobSelection.errorLoading": {
    he: "שגיאה בטעינת עבודות",
    ru: "Ошибка загрузки заказов",
  },
  "jobSelection.tryRefresh": {
    he: "נסה לרענן את הדף או פנה למנהל",
    ru: "Попробуйте обновить страницу или обратитесь к администратору",
  },
  // ============================================
  // JOB PROGRESS PANEL translations
  // ============================================
  "jobProgress.noJobSelected": {
    he: "לא נבחרה עבודה",
    ru: "Заказ не выбран",
  },
  "jobProgress.selectJobToStart": {
    he: "בחר עבודה להתחלת ייצור",
    ru: "Выберите заказ для начала производства",
  },
  "jobProgress.activeProduction": {
    he: "ייצור פעיל",
    ru: "Активное производство",
  },
  "jobProgress.waiting": {
    he: "ממתין",
    ru: "Ожидание",
  },
  "jobProgress.job": {
    he: "עבודה {{number}}",
    ru: "Заказ {{number}}",
  },
  "jobProgress.product": {
    he: "מוצר:",
    ru: "Продукт:",
  },
  "jobProgress.switchJob": {
    he: "החלף עבודה",
    ru: "Сменить заказ",
  },
  "jobProgress.totalReported": {
    he: "סהכ דווח",
    ru: "Всего отчитано",
  },
  "jobProgress.remaining": {
    he: "נותר",
    ru: "Осталось",
  },
  // ============================================
  // PIPELINE FLOW translations
  // ============================================
  "pipeline.flowTitle": {
    he: "זרימת קו ייצור",
    ru: "Поток производственной линии",
  },
  "pipeline.startLine": {
    he: "התחלת קו",
    ru: "Начало линии",
  },
  "pipeline.rawMaterial": {
    he: "חומר גלם",
    ru: "Сырьё",
  },
  "pipeline.endLine": {
    he: "סיום קו",
    ru: "Конец линии",
  },
  "pipeline.finishedProducts": {
    he: "מוצרים מוכנים",
    ru: "Готовые изделия",
  },
  "pipeline.waitingForUs": {
    he: "ממתינים לנו",
    ru: "Ждут нас",
  },
  "pipeline.goingOut": {
    he: "יוצאים הלאה",
    ru: "Выходят дальше",
  },
  "pipeline.free": {
    he: "פנוי",
    ru: "Свободно",
  },
  "pipeline.youAreHere": {
    he: "אתה כאן",
    ru: "Вы здесь",
  },
  "pipeline.reportedInShift": {
    he: "דווח במשמרת",
    ru: "Отчитано за смену",
  },
  // ============================================
  // QUANTITY REPORT DIALOG translations
  // ============================================
  "quantity.dialog.title": {
    he: "דיווח כמויות",
    ru: "Отчёт о количестве",
  },
  "quantity.dialog.product": {
    he: "מוצר:",
    ru: "Продукт:",
  },
  "quantity.mode.totalJob": {
    he: "סה״כ לפק״ע",
    ru: "Всего по заказу",
  },
  "quantity.mode.totalSession": {
    he: "סה״כ למשמרת",
    ru: "Всего за смену",
  },
  "quantity.mode.additional": {
    he: "כמות נוספת",
    ru: "Дополнительное количество",
  },
  "quantity.required": {
    he: "נדרש סהכ:",
    ru: "Всего требуется:",
  },
  "quantity.completeJobItem": {
    he: "השלם לסגירת הפק\"ע ({{count}})",
    ru: "Завершить заказ ({{count}})",
  },
  "quantity.scrap.totalJob": {
    he: "סה״כ פסול למשמרת",
    ru: "Всего брака за смену",
  },
  "quantity.scrap.totalSession": {
    he: "סה״כ פסול למשמרת",
    ru: "Всего брака за смену",
  },
  "quantity.scrap.additional": {
    he: "פסול נוסף",
    ru: "Дополнительный брак",
  },
  "quantity.scrap.description": {
    he: "תיאור הפסול",
    ru: "Описание брака",
  },
  "quantity.scrap.placeholder": {
    he: "תאר את סיבת הפסול...",
    ru: "Опишите причину брака...",
  },
  "quantity.scrap.required": {
    he: "יש להזין תיאור כאשר מדווחים על פסול",
    ru: "Необходимо указать описание при отчёте о браке",
  },
  "quantity.scrap.image": {
    he: "תמונה (אופציונלי)",
    ru: "Фото (необязательно)",
  },
  "quantity.progress.status": {
    he: "מצב עבודה",
    ru: "Статус работы",
  },
  "quantity.progress.remaining": {
    he: "נותר:",
    ru: "Осталось:",
  },
  "quantity.progress.current": {
    he: "נוכחי:",
    ru: "Текущее:",
  },
  "quantity.error.overflow": {
    he: "לא ניתן לדווח יותר מ-{{max}} יחידות",
    ru: "Нельзя отчитать более {{max}} единиц",
  },
  "quantity.error.belowMin": {
    he: "לא ניתן לדווח {{label}} פחות מ-{{min}} (כבר דווח)",
    ru: "Нельзя отчитать {{label}} меньше {{min}} (уже отчитано)",
  },
  "quantity.error.belowMinScrap": {
    he: "לא ניתן לדווח סה״כ פסול פחות מ-{{min}} (כבר דווח)",
    ru: "Нельзя отчитать всего брака меньше {{min}} (уже отчитано)",
  },
  "quantity.error.negative": {
    he: "הכמויות חייבות להיות חיוביות",
    ru: "Количество должно быть положительным",
  },
  "quantity.error.scrapNote": {
    he: "יש להזין תיאור כאשר מדווחים על פסול",
    ru: "Необходимо указать описание при отчёте о браке",
  },
  "quantity.submit.saving": {
    he: "שומר...",
    ru: "Сохранение...",
  },
  "quantity.submit.closeItem": {
    he: "סגור פריט עבודה",
    ru: "Закрыть элемент заказа",
  },
  "quantity.submit.update": {
    he: "עדכן כמות",
    ru: "Обновить количество",
  },
  // ============================================
  // WORK PAGE - Additional translations
  // ============================================
  "work.noJobSelected": {
    he: "לא נבחרה עבודה",
    ru: "Заказ не выбран",
  },
  "work.loadingStatuses": {
    he: "טוען סטטוסים...",
    ru: "Загрузка статусов...",
  },
  "work.switchJob": {
    he: "החלף עבודה",
    ru: "Сменить заказ",
  },
  "work.selectJob": {
    he: "בחר עבודה",
    ru: "Выбрать заказ",
  },
  "work.selectJobForProduction": {
    he: "בחר עבודה לייצור",
    ru: "Выберите заказ для производства",
  },
  "work.error.generic": {
    he: "אירעה שגיאה",
    ru: "Произошла ошибка",
  },
  "work.error.bindJob": {
    he: "שגיאה בקשירת העבודה",
    ru: "Ошибка привязки заказа",
  },
  "work.error.loadStatuses": {
    he: "שגיאה בטעינת סטטוסים",
    ru: "Ошибка загрузки статусов",
  },
  "work.creatingSession": {
    he: "מתחיל משמרת...",
    ru: "Начинаю смену...",
  },
  // ============================================
  // FIRST PRODUCT QA translations
  // ============================================
  "firstProductQA.title": {
    he: "בדיקת מוצר ראשון",
    ru: "Проверка первого изделия",
  },
  "firstProductQA.description": {
    he: "יש לקבל אישור מנהל לפני המשך הייצור",
    ru: "Требуется одобрение руководителя перед продолжением производства",
  },
  "firstProductQA.status.pending": {
    he: "ממתין לאישור",
    ru: "Ожидает одобрения",
  },
  "firstProductQA.status.approved": {
    he: "אושר",
    ru: "Одобрено",
  },
  "firstProductQA.status.rejected": {
    he: "נדחה",
    ru: "Отклонено",
  },
  "firstProductQA.requestApproval": {
    he: "שלח בקשת אישור",
    ru: "Отправить запрос на одобрение",
  },
  "firstProductQA.waitingApproval": {
    he: "ממתין לאישור מנהל",
    ru: "Ожидание одобрения руководителя",
  },
  // ============================================
  // FIRST PRODUCT APPROVAL (per-step, per-session)
  // ============================================
  "firstProductApprovalRequired": {
    he: "נדרש אישור מוצר ראשון",
    ru: "Требуется одобрение первого изделия",
  },
  "firstProductSubmitDescription": {
    he: "יש להגיש דוח מוצר ראשון לפני כניסה לייצור",
    ru: "Необходимо подать отчет о первом изделии перед началом производства",
  },
  "firstProductPendingDescription": {
    he: "הבקשה נשלחה, ממתינים לאישור מנהל",
    ru: "Запрос отправлен, ожидание одобрения руководителя",
  },
  "firstProductApproved": {
    he: "מוצר ראשון אושר",
    ru: "Первое изделие одобрено",
  },
  "submitFirstProductReport": {
    he: "שלח דוח מוצר ראשון",
    ru: "Отправить отчет о первом изделии",
  },
  "descriptionOptional": {
    he: "תיאור (אופציונלי)",
    ru: "Описание (необязательно)",
  },
  "imageOptional": {
    he: "תמונה (אופציונלי)",
    ru: "Изображение (необязательно)",
  },
  "firstProductDescriptionPlaceholder": {
    he: "הוסף הערות או תיאור למוצר הראשון...",
    ru: "Добавьте заметки или описание первого изделия...",
  },
  "addPhoto": {
    he: "הוסף תמונה",
    ru: "Добавить фото",
  },
  "waitingForApproval": {
    he: "ממתין לאישור...",
    ru: "Ожидание одобрения...",
  },
  "awaiting": {
    he: "ממתין",
    ru: "Ожидание",
  },
  "pending": {
    he: "בהמתנה",
    ru: "В ожидании",
  },
  "approved": {
    he: "אושר",
    ru: "Одобрено",
  },
  "submitting": {
    he: "שולח",
    ru: "Отправка",
  },
  "product": {
    he: "מוצר",
    ru: "Изделие",
  },
  "station": {
    he: "תחנה",
    ru: "Станция",
  },
  "productionBlockedUntilApproval": {
    he: "לא ניתן להיכנס לייצור עד לאישור מוצר ראשון",
    ru: "Нельзя начать производство до одобрения первого изделия",
  },
  // ============================================
  // JOB COMPLETION DIALOG translations
  // ============================================
  "jobCompletion.title": {
    he: "סיום עבודה",
    ru: "Завершение заказа",
  },
  "jobCompletion.description": {
    he: "האם לסגור את העבודה הנוכחית?",
    ru: "Закрыть текущий заказ?",
  },
  "jobCompletion.confirm": {
    he: "סגור עבודה",
    ru: "Закрыть заказ",
  },
  // ============================================
  // SCRAP SECTION translations
  // ============================================
  "scrap.section.title": {
    he: "פסולים",
    ru: "Брак",
  },
  "scrap.section.count": {
    he: "{{count}} פסולים",
    ru: "{{count}} брака",
  },
  "scrap.section.noScrap": {
    he: "אין פסולים",
    ru: "Нет брака",
  },
  // ============================================
  // DUAL PROGRESS BAR translations
  // ============================================
  "progress.completed": {
    he: "הושלם",
    ru: "Завершено",
  },
  "progress.planned": {
    he: "מתוכנן",
    ru: "Запланировано",
  },
  "progress.thisSession": {
    he: "במשמרת זו",
    ru: "В этой смене",
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

