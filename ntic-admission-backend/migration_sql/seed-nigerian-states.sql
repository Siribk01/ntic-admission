-- Up Migration

-- All 36 states and the Federal Capital Territory, with their standard two-letter codes (ISO 3166-2:NG).
-- A state is skipped if its name OR its code is already in the table, so this is safe to run even if you already have some states.
INSERT INTO states (name, code)
SELECT v.name, v.code
  FROM (VALUES
    ('Abia','AB'),('Adamawa','AD'),('Akwa Ibom','AK'),('Anambra','AN'),('Bauchi','BA'),('Bayelsa','BY'),('Benue','BE'),('Borno','BO'),
    ('Cross River','CR'),('Delta','DE'),('Ebonyi','EB'),('Edo','ED'),('Ekiti','EK'),('Enugu','EN'),('Federal Capital Territory','FC'),
    ('Gombe','GO'),('Imo','IM'),('Jigawa','JI'),('Kaduna','KD'),('Kano','KN'),('Katsina','KT'),('Kebbi','KE'),('Kogi','KO'),('Kwara','KW'),
    ('Lagos','LA'),('Nasarawa','NA'),('Niger','NI'),('Ogun','OG'),('Ondo','ON'),('Osun','OS'),('Oyo','OY'),('Plateau','PL'),('Rivers','RI'),
    ('Sokoto','SO'),('Taraba','TA'),('Yobe','YO'),('Zamfara','ZA')
  ) AS v(name, code)
 WHERE NOT EXISTS (SELECT 1 FROM states s WHERE lower(s.name) = lower(v.name) OR upper(s.code) = v.code);

-- Down Migration
-- Nothing to undo: removing states could break children already linked to them.
