// Curated identities, not a Cartesian product of movement/equipment labels.
// slug | English | Italian | equipment. Mechanical variants remain distinct.
export const exerciseGroups = {
  chest: `
barbell_flat_bench_press|Barbell Bench Press|Panca piana con bilanciere|barbell
dumbbell_flat_bench_press|Dumbbell Bench Press|Panca piana con manubri|dumbbell
smith_flat_bench_press|Smith Machine Bench Press|Panca piana alla Smith machine|smith
machine_chest_press|Chest Press Machine|Chest press alla macchina|machine
barbell_incline_bench_press|Incline Barbell Bench Press|Panca inclinata con bilanciere|barbell
dumbbell_incline_bench_press|Incline Dumbbell Press|Panca inclinata con manubri|dumbbell
smith_incline_bench_press|Smith Incline Bench Press|Panca inclinata alla Smith machine|smith
machine_incline_chest_press|Incline Chest Press Machine|Chest press inclinata alla macchina|machine
barbell_decline_bench_press|Decline Barbell Bench Press|Panca declinata con bilanciere|barbell
dumbbell_decline_bench_press|Decline Dumbbell Bench Press|Panca declinata con manubri|dumbbell
smith_decline_bench_press|Smith Decline Bench Press|Panca declinata alla Smith machine|smith
dumbbell_flat_fly|Flat Dumbbell Fly|Croci su panca piana con manubri|dumbbell
dumbbell_incline_fly|Incline Dumbbell Fly|Croci su panca inclinata con manubri|dumbbell
dumbbell_decline_fly|Decline Dumbbell Fly|Croci su panca declinata con manubri|dumbbell
pec_deck|Pec Deck Fly|Croci alla pec deck|machine
cable_standing_fly|Standing Cable Fly|Croci ai cavi in piedi|cable
cable_high_to_low_fly|High-to-Low Cable Fly|Croci ai cavi dall'alto|cable
cable_low_to_high_fly|Low-to-High Cable Fly|Croci ai cavi dal basso|cable
cable_flat_bench_fly|Flat Bench Cable Fly|Croci ai cavi su panca piana|cable
push_up|Push-Up|Piegamenti a terra|bodyweight
incline_push_up|Incline Push-Up|Piegamenti con mani rialzate|bodyweight
decline_push_up|Decline Push-Up|Piegamenti con piedi rialzati|bodyweight
chest_dip|Chest Dip|Dip alle parallele per il petto|bodyweight
assisted_chest_dip|Assisted Chest Dip|Dip assistiti per il petto|assisted_machine
dumbbell_squeeze_press|Dumbbell Squeeze Press|Squeeze press con manubri|dumbbell
`,
  back: `
barbell_bent_over_row|Barbell Bent-Over Row|Rematore con bilanciere|barbell
barbell_pendlay_row|Pendlay Row|Rematore Pendlay|barbell
barbell_underhand_row|Underhand Barbell Row|Rematore con bilanciere presa supina|barbell
dumbbell_one_arm_row|One-Arm Dumbbell Row|Rematore con manubrio a un braccio|dumbbell
dumbbell_bent_over_row|Dumbbell Bent-Over Row|Rematore con due manubri|dumbbell
dumbbell_chest_supported_row|Chest-Supported Dumbbell Row|Rematore con manubri su panca inclinata|dumbbell
machine_chest_supported_row|Chest-Supported Machine Row|Rematore alla macchina con appoggio al petto|machine
machine_high_row|Machine High Row|High row alla macchina|machine
machine_low_row|Machine Low Row|Low row alla macchina|machine
t_bar_row|T-Bar Row|Rematore T-bar|landmine
chest_supported_t_bar_row|Chest-Supported T-Bar Row|Rematore T-bar con appoggio al petto|machine
seated_cable_row|Seated Cable Row|Rematore al cavo da seduto|cable
wide_grip_cable_row|Wide-Grip Cable Row|Rematore al cavo presa larga|cable
one_arm_cable_row|One-Arm Cable Row|Rematore al cavo a un braccio|cable
lat_pulldown|Lat Pulldown|Lat machine presa prona|cable
wide_grip_lat_pulldown|Wide-Grip Lat Pulldown|Lat machine presa larga|cable
close_neutral_lat_pulldown|Close Neutral-Grip Lat Pulldown|Lat machine presa neutra stretta|cable
underhand_lat_pulldown|Underhand Lat Pulldown|Lat machine presa supina|cable
one_arm_lat_pulldown|One-Arm Lat Pulldown|Lat machine a un braccio|cable
machine_pullover|Machine Pullover|Pullover alla macchina|machine
cable_straight_arm_pulldown|Straight-Arm Cable Pulldown|Pulldown a braccia tese al cavo|cable
dumbbell_pullover|Dumbbell Pullover|Pullover con manubrio|dumbbell
pull_up|Pull-Up|Trazioni presa prona|bodyweight
chin_up|Chin-Up|Trazioni presa supina|bodyweight
neutral_grip_pull_up|Neutral-Grip Pull-Up|Trazioni presa neutra|bodyweight
assisted_pull_up|Assisted Pull-Up|Trazioni assistite presa prona|assisted_machine
inverted_row|Inverted Row|Rematore inverso a corpo libero|bodyweight
back_extension|Back Extension|Estensioni lombari|bodyweight
reverse_hyperextension|Reverse Hyperextension|Iperestensioni inverse|machine
smith_bent_over_row|Smith Machine Row|Rematore alla Smith machine|smith
`,
  shoulders: `
barbell_overhead_press|Standing Barbell Overhead Press|Lento avanti in piedi con bilanciere|barbell
seated_barbell_overhead_press|Seated Barbell Overhead Press|Lento avanti seduto con bilanciere|barbell
standing_dumbbell_press|Standing Dumbbell Shoulder Press|Lento avanti in piedi con manubri|dumbbell
seated_dumbbell_press|Seated Dumbbell Shoulder Press|Lento avanti seduto con manubri|dumbbell
arnold_press|Arnold Press|Arnold press|dumbbell
smith_shoulder_press|Smith Machine Shoulder Press|Lento avanti alla Smith machine|smith
machine_shoulder_press|Machine Shoulder Press|Shoulder press alla macchina|machine
one_arm_landmine_press|One-Arm Landmine Press|Landmine press a un braccio|landmine
dumbbell_lateral_raise|Dumbbell Lateral Raise|Alzate laterali con manubri|dumbbell
seated_dumbbell_lateral_raise|Seated Dumbbell Lateral Raise|Alzate laterali seduto con manubri|dumbbell
one_arm_cable_lateral_raise|One-Arm Cable Lateral Raise|Alzata laterale al cavo a un braccio|cable
machine_lateral_raise|Machine Lateral Raise|Alzate laterali alla macchina|machine
dumbbell_front_raise|Dumbbell Front Raise|Alzate frontali con manubri|dumbbell
barbell_front_raise|Barbell Front Raise|Alzate frontali con bilanciere|barbell
cable_front_raise|Cable Front Raise|Alzate frontali al cavo|cable
plate_front_raise|Plate Front Raise|Alzate frontali con disco|plate
dumbbell_rear_delt_fly|Bent-Over Dumbbell Rear Delt Fly|Alzate posteriori busto flesso con manubri|dumbbell
incline_rear_delt_fly|Incline Bench Rear Delt Fly|Alzate posteriori con manubri su panca inclinata|dumbbell
reverse_pec_deck|Reverse Pec Deck|Croci inverse alla pec deck|machine
cable_reverse_fly|Cable Reverse Fly|Croci inverse ai cavi|cable
cable_face_pull|Cable Face Pull|Face pull al cavo|cable
barbell_upright_row|Barbell Upright Row|Tirate al mento con bilanciere|barbell
cable_upright_row|Cable Upright Row|Tirate al mento al cavo|cable
barbell_shrug|Barbell Shrug|Scrollate con bilanciere|barbell
dumbbell_shrug|Dumbbell Shrug|Scrollate con manubri|dumbbell
`,
  biceps: `
barbell_curl|Barbell Curl|Curl con bilanciere dritto|barbell
ez_bar_curl|EZ-Bar Curl|Curl con bilanciere EZ|ez_bar
dumbbell_curl|Dumbbell Curl|Curl con manubri|dumbbell
alternating_dumbbell_curl|Alternating Dumbbell Curl|Curl alternato con manubri|dumbbell
incline_dumbbell_curl|Incline Dumbbell Curl|Curl con manubri su panca inclinata|dumbbell
hammer_curl|Hammer Curl|Curl a martello con manubri|dumbbell
cross_body_hammer_curl|Cross-Body Hammer Curl|Curl a martello incrociato|dumbbell
concentration_curl|Concentration Curl|Curl concentrato con manubrio|dumbbell
ez_preacher_curl|EZ-Bar Preacher Curl|Curl alla panca Scott con bilanciere EZ|ez_bar
dumbbell_preacher_curl|Dumbbell Preacher Curl|Curl alla panca Scott con manubrio|dumbbell
machine_preacher_curl|Machine Preacher Curl|Curl alla macchina Scott|machine
cable_curl|Cable Curl|Curl al cavo basso|cable
cable_rope_hammer_curl|Cable Rope Hammer Curl|Curl a martello al cavo con corda|cable
bayesian_cable_curl|Bayesian Cable Curl|Curl bayesiano al cavo|cable
high_cable_curl|High Cable Curl|Curl ai cavi alti|cable
spider_curl|Dumbbell Spider Curl|Spider curl con manubri|dumbbell
reverse_barbell_curl|Reverse Barbell Curl|Curl inverso con bilanciere|barbell
zottman_curl|Zottman Curl|Curl Zottman|dumbbell
`,
  triceps: `
close_grip_barbell_bench|Close-Grip Barbell Bench Press|Panca presa stretta con bilanciere|barbell
ez_skull_crusher|EZ-Bar Skull Crusher|French press su panca con bilanciere EZ|ez_bar
dumbbell_skull_crusher|Dumbbell Skull Crusher|French press su panca con manubri|dumbbell
seated_dumbbell_overhead_extension|Seated Dumbbell Overhead Triceps Extension|Estensione tricipiti sopra la testa con un manubrio|dumbbell
one_arm_dumbbell_overhead_extension|One-Arm Dumbbell Overhead Triceps Extension|Estensione tricipiti sopra la testa a un braccio con manubrio|dumbbell
cable_rope_pushdown|Rope Triceps Pushdown|Pushdown tricipiti con corda|cable
cable_bar_pushdown|Straight-Bar Triceps Pushdown|Pushdown tricipiti con barra dritta|cable
cable_v_bar_pushdown|V-Bar Triceps Pushdown|Pushdown tricipiti con barra a V|cable
cable_reverse_grip_pushdown|Reverse-Grip Triceps Pushdown|Pushdown tricipiti presa inversa|cable
one_arm_cable_pushdown|One-Arm Cable Pushdown|Pushdown al cavo a un braccio|cable
cable_rope_overhead_extension|Rope Overhead Triceps Extension|Estensioni tricipiti sopra la testa al cavo con corda|cable
one_arm_cable_overhead_extension|One-Arm Cable Overhead Triceps Extension|Estensione tricipiti sopra la testa al cavo a un braccio|cable
dumbbell_kickback|Dumbbell Triceps Kickback|Kickback tricipiti con manubrio|dumbbell
cable_kickback|Cable Triceps Kickback|Kickback tricipiti al cavo|cable
machine_triceps_extension|Machine Triceps Extension|Estensioni tricipiti alla macchina|machine
machine_triceps_dip|Machine Triceps Dip|Dip tricipiti alla macchina|machine
triceps_dip|Triceps Dip|Dip alle parallele per tricipiti|bodyweight
bench_dip|Bench Dip|Dip su panca|bodyweight
diamond_push_up|Diamond Push-Up|Piegamenti a diamante|bodyweight
ez_overhead_triceps_extension|EZ-Bar Overhead Triceps Extension|Estensioni tricipiti sopra la testa con bilanciere EZ|ez_bar
`,
  quadriceps: `
barbell_back_squat|Barbell Back Squat|Squat con bilanciere sulla schiena|barbell
barbell_front_squat|Barbell Front Squat|Front squat con bilanciere|barbell
smith_squat|Smith Machine Squat|Squat alla Smith machine|smith
hack_squat|Hack Squat Machine|Hack squat alla macchina|machine
leg_press_45|45-Degree Leg Press|Leg press a 45 gradi|machine
horizontal_leg_press|Horizontal Leg Press|Leg press orizzontale|machine
single_leg_press|Single-Leg Press|Leg press a una gamba|machine
leg_extension|Leg Extension|Leg extension|machine
single_leg_extension|Single-Leg Extension|Leg extension a una gamba|machine
goblet_squat|Goblet Squat|Goblet squat con kettlebell|kettlebell
dumbbell_goblet_squat|Dumbbell Goblet Squat|Goblet squat con manubrio|dumbbell
dumbbell_bulgarian_split_squat|Dumbbell Bulgarian Split Squat|Squat bulgaro con manubri|dumbbell
barbell_split_squat|Barbell Split Squat|Split squat con bilanciere|barbell
dumbbell_walking_lunge|Dumbbell Walking Lunge|Affondi camminati con manubri|dumbbell
barbell_walking_lunge|Barbell Walking Lunge|Affondi camminati con bilanciere|barbell
dumbbell_reverse_lunge|Dumbbell Reverse Lunge|Affondi indietro con manubri|dumbbell
dumbbell_step_up|Dumbbell Step-Up|Step-up con manubri|dumbbell
bodyweight_squat|Bodyweight Squat|Squat a corpo libero|bodyweight
sissy_squat|Sissy Squat|Sissy squat a corpo libero|bodyweight
belt_squat|Belt Squat|Squat con cintura|machine
`,
  hamstrings: `
barbell_romanian_deadlift|Barbell Romanian Deadlift|Stacco rumeno con bilanciere|barbell
dumbbell_romanian_deadlift|Dumbbell Romanian Deadlift|Stacco rumeno con manubri|dumbbell
single_leg_dumbbell_rdl|Single-Leg Dumbbell Romanian Deadlift|Stacco rumeno a una gamba con manubri|dumbbell
smith_romanian_deadlift|Smith Romanian Deadlift|Stacco rumeno alla Smith machine|smith
seated_leg_curl|Seated Leg Curl|Leg curl da seduto|machine
lying_leg_curl|Lying Leg Curl|Leg curl da sdraiato|machine
standing_leg_curl|Standing Leg Curl|Leg curl in piedi a una gamba|machine
nordic_curl|Nordic Hamstring Curl|Nordic curl|bodyweight
glute_ham_raise|Glute-Ham Raise|Glute-ham raise|bodyweight
barbell_good_morning|Barbell Good Morning|Good morning con bilanciere|barbell
stability_ball_leg_curl|Stability Ball Leg Curl|Leg curl su fitball|bodyweight
slider_leg_curl|Slider Leg Curl|Leg curl con slider|bodyweight
`,
  glutes: `
barbell_hip_thrust|Barbell Hip Thrust|Hip thrust con bilanciere|barbell
smith_hip_thrust|Smith Hip Thrust|Hip thrust alla Smith machine|smith
machine_hip_thrust|Machine Hip Thrust|Hip thrust alla macchina|machine
bodyweight_glute_bridge|Glute Bridge|Ponte glutei a corpo libero|bodyweight
barbell_glute_bridge|Barbell Glute Bridge|Ponte glutei con bilanciere|barbell
single_leg_glute_bridge|Single-Leg Glute Bridge|Ponte glutei a una gamba|bodyweight
cable_glute_kickback|Cable Glute Kickback|Slancio posteriore al cavo per glutei|cable
machine_glute_kickback|Machine Glute Kickback|Slancio posteriore alla macchina per glutei|machine
machine_hip_abduction|Machine Hip Abduction|Abduzioni delle anche alla macchina|machine
cable_hip_abduction|Cable Hip Abduction|Abduzione dell'anca al cavo|cable
machine_hip_adduction|Machine Hip Adduction|Adduzioni delle anche alla macchina|machine
cable_hip_adduction|Cable Hip Adduction|Adduzione dell'anca al cavo|cable
cable_pull_through|Cable Pull-Through|Pull-through al cavo|cable
dumbbell_lateral_lunge|Dumbbell Lateral Lunge|Affondi laterali con manubri|dumbbell
sumo_dumbbell_squat|Dumbbell Sumo Squat|Squat sumo con manubrio|dumbbell
frog_pump|Frog Pump|Frog pump a corpo libero|bodyweight
`,
  calves: `
standing_calf_raise_machine|Standing Machine Calf Raise|Calf raise in piedi alla macchina|machine
seated_calf_raise_machine|Seated Machine Calf Raise|Calf raise seduto alla macchina|machine
leg_press_calf_raise|Leg Press Calf Raise|Calf raise alla leg press|machine
smith_calf_raise|Smith Machine Calf Raise|Calf raise alla Smith machine|smith
single_leg_dumbbell_calf_raise|Single-Leg Dumbbell Calf Raise|Calf raise a una gamba con manubrio|dumbbell
bodyweight_calf_raise|Bodyweight Calf Raise|Calf raise a corpo libero|bodyweight
donkey_calf_raise|Donkey Calf Raise Machine|Donkey calf raise alla macchina|machine
tibialis_raise|Tibialis Raise|Sollevamenti per il tibiale anteriore|bodyweight
`,
  core: `
crunch|Crunch|Crunch a terra|bodyweight
reverse_crunch|Reverse Crunch|Crunch inverso|bodyweight
cable_crunch|Cable Crunch|Crunch al cavo|cable
machine_crunch|Machine Crunch|Crunch alla macchina|machine
decline_sit_up|Decline Sit-Up|Sit-up su panca declinata|bodyweight
hanging_knee_raise|Hanging Knee Raise|Sollevamento ginocchia alla sbarra|bodyweight
hanging_leg_raise|Hanging Leg Raise|Sollevamento gambe alla sbarra|bodyweight
captains_chair_knee_raise|Captain's Chair Knee Raise|Sollevamento ginocchia alle parallele con appoggio|bodyweight
lying_leg_raise|Lying Leg Raise|Sollevamento gambe da sdraiato|bodyweight
plank|Plank|Plank|bodyweight
side_plank|Side Plank|Plank laterale|bodyweight
ab_wheel_rollout|Ab Wheel Rollout|Rollout con ruota addominale|bodyweight
barbell_rollout|Barbell Rollout|Rollout con bilanciere|barbell
dead_bug|Dead Bug|Dead bug|bodyweight
bird_dog|Bird Dog|Bird dog|bodyweight
pallof_press|Pallof Press|Pallof press al cavo|cable
cable_woodchop|Cable Woodchop|Woodchop al cavo|cable
machine_torso_rotation|Machine Torso Rotation|Rotazioni del busto alla macchina|machine
weighted_russian_twist|Plate Russian Twist|Russian twist con disco|plate
bicycle_crunch|Bicycle Crunch|Crunch a bicicletta|bodyweight
mountain_climber|Mountain Climber|Mountain climber|bodyweight
hollow_body_hold|Hollow Body Hold|Tenuta hollow body|bodyweight
v_up|V-Up|Chiusure a V|bodyweight
heel_touch|Heel Touch|Tocchi ai talloni|bodyweight
stability_ball_crunch|Stability Ball Crunch|Crunch su fitball|bodyweight
`,
  full_body: `
barbell_deadlift|Conventional Barbell Deadlift|Stacco da terra convenzionale|barbell
barbell_sumo_deadlift|Sumo Barbell Deadlift|Stacco da terra sumo|barbell
trap_bar_deadlift|Trap-Bar Deadlift|Stacco con trap bar|trap_bar
barbell_rack_pull|Barbell Rack Pull|Stacco dai blocchi con bilanciere|barbell
kettlebell_swing|Two-Hand Kettlebell Swing|Swing con kettlebell a due mani|kettlebell
one_arm_kettlebell_swing|One-Arm Kettlebell Swing|Swing con kettlebell a un braccio|kettlebell
kettlebell_clean|Kettlebell Clean|Girata con kettlebell|kettlebell
kettlebell_snatch|Kettlebell Snatch|Strappo con kettlebell|kettlebell
turkish_get_up|Turkish Get-Up|Turkish get-up con kettlebell|kettlebell
barbell_power_clean|Barbell Power Clean|Girata al petto in semipiegata|barbell
barbell_push_press|Barbell Push Press|Push press con bilanciere|barbell
barbell_thruster|Barbell Thruster|Thruster con bilanciere|barbell
dumbbell_thruster|Dumbbell Thruster|Thruster con manubri|dumbbell
burpee|Burpee|Burpee|bodyweight
farmers_carry|Dumbbell Farmer's Carry|Camminata del contadino con manubri|dumbbell
sled_push|Sled Push|Spinta della slitta|sled
sled_drag|Sled Drag|Traino della slitta|sled
battle_rope_waves|Battle Rope Waves|Onde con battle rope|rope
`,
};

export const curatedAliases = {
  dumbbell_flat_bench_press: ['DB Bench Press', 'Dumbell Bench Press', 'Panca con manubri', 'Bench Press'],
  barbell_flat_bench_press: ['BB Bench Press', 'Panca piana bilanciere', 'Bench Press'],
  dumbbell_incline_bench_press: ['Incline DB Press'],
  barbell_back_squat: ['Barbell Squat', 'Back Squat'],
  barbell_deadlift: ['Deadlift', 'Conventional Deadlift'],
  barbell_romanian_deadlift: ['Barbell RDL'],
  dumbbell_romanian_deadlift: ['DB RDL'],
  lat_pulldown: ['Lat Pulldowns'],
  pull_up: ['Pull Ups'],
  one_arm_lat_pulldown: ['Single Hand Pulldown'],
  one_arm_cable_row: ['Pulley Singolo'],
  cable_rope_pushdown: ['Rope Pushdown'],
  // Ambiguous legacy shorthand is deliberately represented as multiple matches.
  barbell_overhead_press: ['Military Press'],
  seated_dumbbell_press: ['Military Press'],
  dumbbell_lateral_raise: ['Lateral Raises'],
  one_arm_cable_lateral_raise: ['Lateral Raises'],
};
