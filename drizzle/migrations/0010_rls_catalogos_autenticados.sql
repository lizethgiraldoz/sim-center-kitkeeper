DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'activities',
    'activity_checklists',
    'activity_resource_templates',
    'resource_categories',
    'resources',
    'semester_practice_rules',
    'spaces',
    'surgical_instruments',
    'surgical_kits'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS "lectura autenticados" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "lectura autenticados" ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);',
      t
    );
  END LOOP;
END $$;