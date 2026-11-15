-- 1. Agregar columna de programas a activities (idempotente)
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS programas text[] NOT NULL DEFAULT '{}'::text[];
-- 2. Cargar prácticas por programa sin duplicar y actualizar inventario sin repetir
DO $$
DECLARE
  v_act_id uuid;
  v_cat_sim uuid;
  v_cat_eq uuid;
  v_cat_id uuid;
  v_exists boolean;
  v_rec record;
  v_inv record;
BEGIN
  SELECT id INTO v_cat_sim FROM public.resource_categories WHERE kind = 'SIMULADOR' LIMIT 1;
  SELECT id INTO v_cat_eq FROM public.resource_categories WHERE kind = 'EQUIPO' LIMIT 1;
  IF v_cat_sim IS NULL THEN SELECT id INTO v_cat_sim FROM public.resource_categories LIMIT 1; END IF;
  IF v_cat_eq IS NULL THEN v_cat_eq := v_cat_sim; END IF;
  -- 2A. Prácticas académicas por programa (sin duplicar)
  FOR v_rec IN SELECT * FROM (VALUES
    ('Instrumentación Quirúrgica', 'Entorno hospitalario'),
    ('Instrumentación Quirúrgica', 'Sistema de quirófanos'),
    ('Instrumentación Quirúrgica', 'Practica I'),
    ('Instrumentación Quirúrgica', 'Ginecología y Obstetricia'),
    ('Instrumentación Quirúrgica', 'Otorrinolaringología'),
    ('Instrumentación Quirúrgica', 'Videoendoscopia'),
    ('Instrumentación Quirúrgica', 'Cirugía de mínimo acceso'),
    ('Instrumentación Quirúrgica', 'Neurocirugía'),
    ('Instrumentación Quirúrgica', 'Cirugía cardiovascular y trasplantes'),
    ('Instrumentación Quirúrgica', 'Otro'),
    ('APH', 'Asistir al usuario'),
    ('APH', 'Accesos y operaciones de Emergencia'),
    ('APH', 'Atender a las personas con alteración de la salud en fase APH'),
    ('APH', 'Admon de Medicamentos'),
    ('APH', 'Diagnostico individual'),
    ('APH', 'Promoción y prevención'),
    ('APH', 'Otro'),
    ('Medicina', 'ABP comunicaciones en salud'),
    ('Medicina', 'Anatomia'),
    ('Medicina', 'Anatomia del sistema endocrino'),
    ('Medicina', 'Atencion del parto normal'),
    ('Medicina', 'Atencion Integral Preescolar'),
    ('Medicina', 'Biologia de la celula'),
    ('Medicina', 'Codigo Rojo'),
    ('Medicina', 'Comportamiento en quirofano'),
    ('Medicina', 'Consulta externa'),
    ('Medicina', 'Consulta Prenatal'),
    ('Medicina', 'Curso introductorio Ginecobstetricia'),
    ('Medicina', 'ECOE - quinto semestre'),
    ('Medicina', 'Enfermeria - Reanimacion neonatal y codigo rojo'),
    ('Medicina', 'Examen Final Ginecostetricia'),
    ('Medicina', 'Examen fisico y fondo de ojo'),
    ('Medicina', 'Falla Cardiaca'),
    ('Medicina', 'Flexible APH'),
    ('Medicina', 'Flexible Parasitologia humana'),
    ('Medicina', 'Insercion de metodos Antinconceptivos'),
    ('Medicina', 'Inyectologia'),
    ('Medicina', 'IVE'),
    ('Medicina', 'Lavado de manos quirurgico'),
    ('Medicina', 'Lavado de manos, Vestida de ropa Quirurgica, Vestida de mesas'),
    ('Medicina', 'Manejo de la via aerea pediatrica'),
    ('Medicina', 'Manejo electro Bisturí/Taller de señales, reconocimiento simuladores y sus funciones'),
    ('Medicina', 'Manejo Equipos e instrumental/ entorno hospitalario'),
    ('Medicina', 'Manejo Simuladores'),
    ('Medicina', 'Maniobras obstetricas'),
    ('Medicina', 'Microcirugia'),
    ('Medicina', 'Minuto de oro'),
    ('Medicina', 'Neuroanatomia'),
    ('Medicina', 'Oxigenoterapia y choque'),
    ('Medicina', 'Paciente Critico'),
    ('Medicina', 'Paciente Simulado'),
    ('Medicina', 'Paso de Sonda Vesical y nasogastrica'),
    ('Medicina', 'Planeamiento hospitalario de Emergencias y desastres'),
    ('Medicina', 'Practica de EKG'),
    ('Medicina', 'Practica de trauma - Primeros auxilios'),
    ('Medicina', 'Primeros Auxilios - Examen Final trauma y RCP'),
    ('Medicina', 'Primeros Auxilios - parcial de RCP'),
    ('Medicina', 'Primeros Auxilios - parcial de Trauma'),
    ('Medicina', 'Primeros Auxilios - RCP'),
    ('Medicina', 'Primeros Auxilios - Signos Vitales'),
    ('Medicina', 'Primeros Auxilios - Translado y transporte'),
    ('Medicina', 'Primeros Auxilios - Vendajes e inmovilizaciones'),
    ('Medicina', 'Puncion lumbar'),
    ('Medicina', 'Reanimacion Basica y Avanzada noveno'),
    ('Medicina', 'Reconocimiento de instrumental'),
    ('Medicina', 'Reduccion de fracturas y luxaciones e inmovilizaciones'),
    ('Medicina', 'Repaso Quirurgico'),
    ('Medicina', 'Reunión administrativa y/o académica'),
    ('Medicina', 'Semiología Cardiopulmonar'),
    ('Medicina', 'Semiología de Abdomen'),
    ('Medicina', 'semiologia quinto semestre (c-tr-tv)'),
    ('Medicina', 'SHAE'),
    ('Medicina', 'SIMUE'),
    ('Medicina', 'Simulación paciente Crítico y urgencias medicas'),
    ('Medicina', 'Soporte vital del paciente pediátrico y adulto'),
    ('Medicina', 'suturas'),
    ('Medicina', 'Suturas - APH'),
    ('Medicina', 'Tacto rectal y de mamas'),
    ('Medicina', 'Tacto rectal y semiologia'),
    ('Medicina', 'Taller de bioetica'),
    ('Medicina', 'Taller de Electrocardiografía 5 semestre'),
    ('Medicina', 'Taller de Episiorrafía'),
    ('Medicina', 'Taller de examen fisico - Otorrinolaringología'),
    ('Medicina', 'Taller de laparoscopia'),
    ('Medicina', 'Taller de medicina legal'),
    ('Medicina', 'Taller de miembro superior'),
    ('Medicina', 'Taller EF RN y de LEV en Neonatos'),
    ('Medicina', 'Taller semiología osteomuscular'),
    ('Medicina', 'Tecnicas quirurgicas'),
    ('Medicina', 'Titulacion- via aerea-secuencia int rapida'),
    ('Medicina', 'Tubo a torax'),
    ('Medicina', 'Urgencias Otorrinolaringología'),
    ('Medicina', 'Urgencias pediatricas'),
    ('Medicina', 'Urología - Tacto rectal y sonda vesical'),
    ('Medicina', 'Vestida del paciente'),
    ('Medicina', 'Vestida microscopio'),
    ('Medicina', 'Consulta nutricional materno infantil'),
    ('Medicina', 'Primeros Auxilios - Parto de emergencia'),
    ('Medicina', 'Reanimacion Pediatrica y acceso intraoseo'),
    ('Medicina', 'Via Aerea Avanzada Pediatrica'),
    ('Medicina', 'Infeccion y cancer'),
    ('Medicina', 'Sindrome compartimental y fractura de pelvis'),
    ('Medicina', 'Examen fisico y semiologia Tecnología APH'),
    ('Medicina', 'Toma de muestra vaginal'),
    ('Medicina', 'Procedimientos Quirurgicos Especializados'),
    ('Medicina', 'Procedimientos Quirurgicos Basicos'),
    ('Medicina', 'Neumotorax'),
    ('Medicina', 'ECOE - Dermatologia 8 semestre'),
    ('Medicina', 'Flexible Cirugia IQ'),
    ('Medicina', 'Radiografía de Torax'),
    ('Medicina', 'Taller introductorio de ginecobstetricia'),
    ('Medicina', 'Casa Simulada - Salud familiar'),
    ('Medicina', 'Consulta externa psiquiatria - 8 semestre'),
    ('Medicina', 'Reanimación pediatrica y neonatal - Enfermeria'),
    ('Medicina', 'Sedación'),
    ('Medicina', 'Flexible primeros Auxilios'),
    ('Medicina', 'Fundamentos rescate en alturas'),
    ('Medicina', 'Simulación atención del paciente intoxicado'),
    ('Posgrados', 'Monitoreo hemodinamico UCI'),
    ('Posgrados', 'Artroscopia'),
    ('Posgrados', 'Cateterismo guiado por ecografo'),
    ('Posgrados', 'CLUVA'),
    ('Posgrados', 'Cricotiroidotomía'),
    ('Posgrados', 'Ecografia'),
    ('Posgrados', 'Fibroscopia'),
    ('Posgrados', 'Radiología pediatrica'),
    ('Posgrados', 'Laboratorio de hueso temporal'),
    ('Posgrados', 'Laparoscopia'),
    ('Posgrados', 'Manejo básico y avanzado de vía aérea'),
    ('Posgrados', 'Micro cirugía'),
    ('Posgrados', 'Microcirugia Ocular'),
    ('Posgrados', 'Oftalmoscopia indirecta'),
    ('Posgrados', 'Procedimientos en ginecobstetricia'),
    ('Posgrados', 'Punción Lumbar residentes'),
    ('Posgrados', 'Reanimación pediátrica'),
    ('Posgrados', 'Reuniones'),
    ('Posgrados', 'Taller de Toxina butolínica'),
    ('Posgrados', 'Urgencias Medicas - Urgentología'),
    ('Posgrados', 'Toxicología ocupacional'),
    ('Posgrados', 'Reanimacion Avanzada'),
    ('Posgrados', 'Procedimientos en urgencias')
  ) AS t(prog, nombre) LOOP
    SELECT id INTO v_act_id FROM public.activities WHERE lower(trim(name)) = lower(trim(v_rec.nombre)) LIMIT 1;
    IF v_act_id IS NOT NULL THEN
      UPDATE public.activities
      SET programas = array_append(COALESCE(programas, '{}'::text[]), v_rec.prog)
      WHERE id = v_act_id AND NOT (v_rec.prog = ANY(COALESCE(programas, '{}'::text[])));
    ELSE
      INSERT INTO public.activities (name, default_duration_minutes, programas)
      VALUES (v_rec.nombre, 120, ARRAY[v_rec.prog]);
    END IF;
  END LOOP;
  -- 2B. Inventario adicional (omitir si el equipo o cualquiera de sus placas ya existe)
  FOR v_inv IN SELECT * FROM (VALUES
    ('BABY ANNE', 'simulador lactante para rcp y OVACE', 8, '157859-1, 157859-2, 157859-3, 157859-4, 157860-1, 157860-2, 157860-3, 157860-4', ARRAY['157859-1', '157859-2', '157859-3', '157859-4', '157860-1', '157860-2', '157860-3', '157860-4']::text[], 'SIMULADOR'),
    ('BEBE SIMMOM', 'bebe simom para parto', 1, '157740-2', ARRAY['157740-2']::text[], 'SIMULADOR'),
    ('BOTIQUIN TRUAMA AVANZADO', 'Botiquín Negro y verde grande con elementos para manejo avanzado de trauma', 3, 'LS001, LS002, LS003', ARRAY['LS001', 'LS002', 'LS003']::text[], 'EQUIPO'),
    ('CABEZAS DE INTUBACION LACTANTES', 'Cabeza para intubacion en lactantes', 2, '190352, 190353', ARRAY['190352', '190353']::text[], 'SIMULADOR'),
    ('CAJA DE CONTROL LIMBOX', 'caja de conexión y enlace entre equipos', 1, '184917-4', ARRAY['184917-4']::text[], 'EQUIPO'),
    ('CAMARA WEB', 'para grabación de examen', 3, '157739-4, 157738-4, 157740-5', ARRAY['157739-4', '157738-4', '157740-5']::text[], 'EQUIPO'),
    ('CAMILLA', 'CAMILLA adulto sencilla', 3, '122040, 122041, 122042', ARRAY['122040', '122041', '122042']::text[], 'EQUIPO'),
    ('CAMILLA', 'CAMILLA pediátrica sencilla', 1, '122043', ARRAY['122043']::text[], 'EQUIPO'),
    ('CARDIO DESFIBRILADOR MANUAL', 'Desfibrilador real para uso en simuladores', 4, '188250, 188251, 188252, 188253', ARRAY['188250', '188251', '188252', '188253']::text[], 'EQUIPO'),
    ('CARRO DE PARO', 'Para practica de manejo del paciente en urgencias', 2, '188260, 134571-1', ARRAY['188260', '134571-1']::text[], 'EQUIPO'),
    ('CILINDRO OXIGENO', 'practicas oxigenoterapia', 3, '134571-2, 152471, 167055', ARRAY['134571-2', '152471', '167055']::text[], 'EQUIPO'),
    ('COMPRESOR', 'para generar aire de respiración y movimientos', 1, '184917-5', ARRAY['184917-5']::text[], 'EQUIPO'),
    ('COMPUTADOR PORTATIL HP', 'pc para controlar simulador', 1, '184917-3', ARRAY['184917-3']::text[], 'EQUIPO'),
    ('COMPUTADOR TODO EN 1', 'Monitoreo signos vitales', 3, '157739-2, 157738-2, 157740-3', ARRAY['157739-2', '157738-2', '157740-3']::text[], 'EQUIPO'),
    ('COMPUTADOR TODO EN UNO HP', 'pc para monitoreo de signos vitales', 1, '184917-2', ARRAY['184917-2']::text[], 'EQUIPO'),
    ('DEA ENTRENAMIENTO LAERDAL', 'simular desfibrilación externa adultos, niños y lactantes', 8, '196355, 196356, 196357, 167504, 157861, 157865, 157862, 157863', ARRAY['196355', '196356', '196357', '167504', '157861', '157865', '157862', '157863']::text[], 'EQUIPO'),
    ('ENTRENADOR RCP/VIAS RESPIRATORIAS ADULTO', 'Cabaza de intubación adulto para manejo avanzado', 2, '189205, 189885', ARRAY['189205', '189885']::text[], 'SIMULADOR'),
    ('ENTRENADOR VIAS RESPIRATORIAS/RCP MULTIPROPOSITO', 'Cabaza de intubación adulto para manejo avanzado', 1, '189886', ARRAY['189886']::text[], 'SIMULADOR'),
    ('LAERDAL NEONATAL INTUBATION TRAINER', 'Cabeza para intubacion neonatal', 2, '157774, 157775', ARRAY['157774', '157775']::text[], 'SIMULADOR'),
    ('MEGACODE KELLY KIT ADVANCED', 'Simulador pediátrico para monitoreo y manejo de vía aérea', 1, '134629', ARRAY['134629']::text[], 'SIMULADOR'),
    ('MICROFONO DIADEMA', 'para el instructor hablar por el simulador', 2, '157739-5, 157740-6', ARRAY['157739-5', '157740-6']::text[], 'EQUIPO'),
    ('NEONATO PARA REANIMACIÓN NEWBORN ANNE', 'Neonato para reanimación , manejo vía aérea y cateterismo umbilical', 4, '157776, 157777, 157858-1, 157858-2', ARRAY['157776', '157777', '157858-1', '157858-2']::text[], 'SIMULADOR'),
    ('PORTATIL', 'Pc instructor manejo simulador', 3, '157739-3, 157738-5, 157740-4', ARRAY['157739-3', '157738-5', '157740-4']::text[], 'EQUIPO'),
    ('SIMMOM (SIMULADOR MATERNO FETAL)', 'Simulador avanzado para parto , código rojo y urgencias ginecológicas', 1, '157740-1', ARRAY['157740-1']::text[], 'SIMULADOR'),
    ('SIMNA 3G', 'simulador cuerpo completo para soporte vital avanzado', 1, '157739-1', ARRAY['157739-1']::text[], 'SIMULADOR'),
    ('SIMNEWB (SIMULADOR NEONATO)', 'Simulador neonato para soporte vital avanzado neonatal', 1, '157738-1', ARRAY['157738-1']::text[], 'SIMULADOR'),
    ('SIMPAD', 'Pc instructor manejo simulador', 1, '157738-3', ARRAY['157738-3']::text[], 'EQUIPO'),
    ('SIMULADOR "PRIMEROS AUXILIOS CUERPO COMPLETO"', 'Simulador cuerpo completo para manejo del trauma y  reanimación', 6, '18732, 18733, 18734, 18735, 18736, 18737', ARRAY['18732', '18733', '18734', '18735', '18736', '18737']::text[], 'SIMULADOR'),
    ('SIMULADOR DE "PUNCIÓN INTRAÓSEA"', 'Acceso intraoseo lactante', 1, '167513', ARRAY['167513']::text[], 'SIMULADOR'),
    ('SIMULADOR DE "PUNCIÓN INTRAÓSEA"', 'Acceso intraoseo pediatrico', 1, '146769', ARRAY['146769']::text[], 'SIMULADOR'),
    ('SIMULADOR DE CRICOTIROIDOTOMIA', 'para realizar practicas de cricotiroidotomia', 1, '167511', ARRAY['167511']::text[], 'SIMULADOR'),
    ('SIMULADOR OVACE - ADULTO', 'para maniobra de  desobstrucción de vía aérea', 2, '161769, 161770', ARRAY['161769', '161770']::text[], 'SIMULADOR'),
    ('SIMULADOR OVACE ADOLECENTE', 'para maniobra de  desobstrucción de vía aérea', 1, '167548-2', ARRAY['167548-2']::text[], 'SIMULADOR'),
    ('SIMULADOR OVACE ADULTO', 'para maniobra de  desobstrucción de vía aérea', 1, '167548-1', ARRAY['167548-1']::text[], 'SIMULADOR'),
    ('SIMULADOR OVACE BEBE', 'para maniobra de  desobstrucción de vía aérea', 1, '167548-4', ARRAY['167548-4']::text[], 'SIMULADOR'),
    ('SIMULADOR OVACE NIÑO', 'para maniobra de  desobstrucción de vía aérea', 1, '167548-3', ARRAY['167548-3']::text[], 'SIMULADOR'),
    ('SIMULADOR PARA TRAUMA Y EXTRICACION', 'Simulador cuerpo completo para manejo del trauma y  vía aérea', 1, '134632', ARRAY['134632']::text[], 'SIMULADOR'),
    ('SIMULADOR SIMBABY', 'Simulador avanzado lactante', 1, '184917-1', ARRAY['184917-1']::text[], 'SIMULADOR'),
    ('SIMULADOR SIMMAN', 'simulador SimMan básico  para soporte vital avanzado', 2, '137684, 137685', ARRAY['137684', '137685']::text[], 'SIMULADOR'),
    ('TABLA DE INMOVILIZACIÓN BAXSTRAP', 'Tabla rígida para inmovilización de cuerpo completo con arnés de sujeción  y bloqueadores laterales', 4, '167544, 167545, 167546, 167547', ARRAY['167544', '167545', '167546', '167547']::text[], 'EQUIPO'),
    ('TOROSO REANIMACION ADULTO', 'simulador para practicas de ventilación con presión positiva y compresiones torácicas', 8, '130398-1, 130398-2, 130398-3, 130398-4, 150723-1, 150723-2, 150723-3, 150723-4', ARRAY['130398-1', '130398-2', '130398-3', '130398-4', '150723-1', '150723-2', '150723-3', '150723-4']::text[], 'SIMULADOR'),
    ('TOROSO REANIMACION PEDIATRICO', 'simulador para practicas de ventilación con presión positiva y compresiones torácicas', 8, '150725-1, 150725-2, 150725-3, 150725-4, 100013-1, 100013-2, 100013-3, 100013-4', ARRAY['150725-1', '150725-2', '150725-3', '150725-4', '100013-1', '100013-2', '100013-3', '100013-4']::text[], 'SIMULADOR'),
    ('TORSO VIA AEREA ADULTO', 'Cabeza para intubacion en adultos', 1, '167506', ARRAY['167506']::text[], 'SIMULADOR'),
    ('TORSO VIA AEREA PEDIATRICO', 'Cabeza para intubacion pediatrica', 2, '167508, 167509', ARRAY['167508', '167509']::text[], 'SIMULADOR')
  ) AS i(nombre, descripcion, cantidad, placas_txt, placas_arr, kind) LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.resources r
      WHERE (
        lower(trim(r.name)) = lower(trim(v_inv.nombre))
        AND coalesce(lower(trim(r.descripcion)), '') = coalesce(lower(trim(v_inv.descripcion)), '')
      )
      OR EXISTS (
        SELECT 1 FROM unnest(v_inv.placas_arr) AS p(placa)
        WHERE trim(p.placa) = ANY(
          SELECT trim(x) FROM unnest(string_to_array(coalesce(r.numero_inventario, ''), ',')) AS x
        )
      )
    ) INTO v_exists;
    IF NOT v_exists THEN
      v_cat_id := CASE WHEN v_inv.kind = 'SIMULADOR' THEN v_cat_sim ELSE v_cat_eq END;
      INSERT INTO public.resources (category_id, name, descripcion, numero_inventario, quantity_total, status, allows_external_exit)
      VALUES (v_cat_id, v_inv.nombre, NULLIF(v_inv.descripcion, ''), v_inv.placas_txt, v_inv.cantidad, 'DISPONIBLE', true);
    END IF;
  END LOOP;
END $$;