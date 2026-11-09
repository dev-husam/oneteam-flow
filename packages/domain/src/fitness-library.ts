import type { EquipmentKind, MuscleGroup } from './fitness.js';

export interface SeedExercise {
  key: string;
  muscleGroup: MuscleGroup;
  equipment: EquipmentKind;
  en: string;
  ar: string;
}

/**
 * The seeded exercise library (bilingual names only). Instructions and media are deliberately not seeded: they
 * need an editorial and licensing decision (see the Phase 6a report). Organizations add their own exercises.
 * Keys are stable: the catalog sync upserts by key, so renaming a key would create a duplicate.
 */
export const SEED_EXERCISES: readonly SeedExercise[] = [
  { key: 'barbell_bench_press', muscleGroup: 'CHEST', equipment: 'BARBELL', en: 'Barbell bench press', ar: 'بنش بريس بالبار' },
  { key: 'incline_dumbbell_press', muscleGroup: 'CHEST', equipment: 'DUMBBELL', en: 'Incline dumbbell press', ar: 'ضغط الدمبل على مقعد مائل' },
  { key: 'dumbbell_fly', muscleGroup: 'CHEST', equipment: 'DUMBBELL', en: 'Dumbbell fly', ar: 'فتح الدمبل للصدر' },
  { key: 'push_up', muscleGroup: 'CHEST', equipment: 'BODYWEIGHT', en: 'Push-up', ar: 'تمرين الضغط' },
  { key: 'cable_crossover', muscleGroup: 'CHEST', equipment: 'CABLE', en: 'Cable crossover', ar: 'تقاطع الكابل' },
  { key: 'chest_press_machine', muscleGroup: 'CHEST', equipment: 'MACHINE', en: 'Chest press machine', ar: 'جهاز ضغط الصدر' },
  { key: 'pull_up', muscleGroup: 'BACK', equipment: 'BODYWEIGHT', en: 'Pull-up', ar: 'العقلة' },
  { key: 'lat_pulldown', muscleGroup: 'BACK', equipment: 'CABLE', en: 'Lat pulldown', ar: 'سحب علوي للظهر' },
  { key: 'barbell_row', muscleGroup: 'BACK', equipment: 'BARBELL', en: 'Barbell row', ar: 'تجديف بالبار' },
  { key: 'seated_cable_row', muscleGroup: 'BACK', equipment: 'CABLE', en: 'Seated cable row', ar: 'تجديف الكابل جالسًا' },
  { key: 'dumbbell_row', muscleGroup: 'BACK', equipment: 'DUMBBELL', en: 'One-arm dumbbell row', ar: 'تجديف بالدمبل بذراع واحدة' },
  { key: 'deadlift', muscleGroup: 'BACK', equipment: 'BARBELL', en: 'Deadlift', ar: 'الرفعة الميتة' },
  { key: 'overhead_press', muscleGroup: 'SHOULDERS', equipment: 'BARBELL', en: 'Overhead press', ar: 'ضغط الأكتاف بالبار' },
  { key: 'dumbbell_shoulder_press', muscleGroup: 'SHOULDERS', equipment: 'DUMBBELL', en: 'Dumbbell shoulder press', ar: 'ضغط الأكتاف بالدمبل' },
  { key: 'lateral_raise', muscleGroup: 'SHOULDERS', equipment: 'DUMBBELL', en: 'Lateral raise', ar: 'رفرفة جانبية' },
  { key: 'face_pull', muscleGroup: 'SHOULDERS', equipment: 'CABLE', en: 'Face pull', ar: 'سحب الوجه' },
  { key: 'barbell_curl', muscleGroup: 'BICEPS', equipment: 'BARBELL', en: 'Barbell curl', ar: 'بايسبس بالبار' },
  { key: 'dumbbell_curl', muscleGroup: 'BICEPS', equipment: 'DUMBBELL', en: 'Dumbbell curl', ar: 'بايسبس بالدمبل' },
  { key: 'hammer_curl', muscleGroup: 'BICEPS', equipment: 'DUMBBELL', en: 'Hammer curl', ar: 'بايسبس هامر' },
  { key: 'triceps_pushdown', muscleGroup: 'TRICEPS', equipment: 'CABLE', en: 'Triceps pushdown', ar: 'ضغط الترايسبس بالكابل' },
  { key: 'skull_crusher', muscleGroup: 'TRICEPS', equipment: 'BARBELL', en: 'Skull crusher', ar: 'ترايسبس مستلقيًا بالبار' },
  { key: 'bench_dip', muscleGroup: 'TRICEPS', equipment: 'BODYWEIGHT', en: 'Bench dip', ar: 'غطس على المقعد' },
  { key: 'wrist_curl', muscleGroup: 'FOREARMS', equipment: 'DUMBBELL', en: 'Wrist curl', ar: 'ثني الرسغ' },
  { key: 'plank', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', en: 'Plank', ar: 'بلانك' },
  { key: 'crunch', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', en: 'Crunch', ar: 'تمرين البطن' },
  { key: 'hanging_leg_raise', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', en: 'Hanging leg raise', ar: 'رفع الساقين من التعلّق' },
  { key: 'russian_twist', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', en: 'Russian twist', ar: 'الالتفاف الروسي' },
  { key: 'barbell_back_squat', muscleGroup: 'QUADS', equipment: 'BARBELL', en: 'Barbell back squat', ar: 'سكوات بالبار' },
  { key: 'goblet_squat', muscleGroup: 'QUADS', equipment: 'DUMBBELL', en: 'Goblet squat', ar: 'سكوات الكأس' },
  { key: 'leg_press', muscleGroup: 'QUADS', equipment: 'MACHINE', en: 'Leg press', ar: 'ضغط الأرجل' },
  { key: 'leg_extension', muscleGroup: 'QUADS', equipment: 'MACHINE', en: 'Leg extension', ar: 'فرد الأرجل' },
  { key: 'walking_lunge', muscleGroup: 'QUADS', equipment: 'DUMBBELL', en: 'Walking lunge', ar: 'اندفاع بالمشي' },
  { key: 'romanian_deadlift', muscleGroup: 'HAMSTRINGS', equipment: 'BARBELL', en: 'Romanian deadlift', ar: 'الرفعة الرومانية' },
  { key: 'leg_curl', muscleGroup: 'HAMSTRINGS', equipment: 'MACHINE', en: 'Leg curl', ar: 'ثني الأرجل' },
  { key: 'hip_thrust', muscleGroup: 'GLUTES', equipment: 'BARBELL', en: 'Hip thrust', ar: 'دفع الورك' },
  { key: 'glute_bridge', muscleGroup: 'GLUTES', equipment: 'BODYWEIGHT', en: 'Glute bridge', ar: 'جسر الأرداف' },
  { key: 'standing_calf_raise', muscleGroup: 'CALVES', equipment: 'MACHINE', en: 'Standing calf raise', ar: 'رفع السمانة واقفًا' },
  { key: 'kettlebell_swing', muscleGroup: 'FULL_BODY', equipment: 'KETTLEBELL', en: 'Kettlebell swing', ar: 'أرجحة الكيتل بيل' },
  { key: 'burpee', muscleGroup: 'FULL_BODY', equipment: 'BODYWEIGHT', en: 'Burpee', ar: 'بيربي' },
  { key: 'treadmill_run', muscleGroup: 'CARDIO', equipment: 'CARDIO_MACHINE', en: 'Treadmill run', ar: 'الجري على السير' },
  { key: 'stationary_bike', muscleGroup: 'CARDIO', equipment: 'CARDIO_MACHINE', en: 'Stationary bike', ar: 'الدراجة الثابتة' },
  { key: 'rowing_machine', muscleGroup: 'CARDIO', equipment: 'CARDIO_MACHINE', en: 'Rowing machine', ar: 'جهاز التجديف' },
  { key: 'jump_rope', muscleGroup: 'CARDIO', equipment: 'OTHER', en: 'Jump rope', ar: 'نط الحبل' },
];
