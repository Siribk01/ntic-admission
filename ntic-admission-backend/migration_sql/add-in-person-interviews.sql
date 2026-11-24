-- Up Migration

-- Interviews can also be held in person, at a place on campus
ALTER TABLE interviews ADD COLUMN location text;

ALTER TABLE interviews DROP CONSTRAINT interviews_platform_valid;
ALTER TABLE interviews ADD CONSTRAINT interviews_platform_valid
  CHECK (platform IN ('google_meet', 'microsoft_teams', 'zoom', 'phone', 'in_person', 'other'));

-- An online interview needs a link. A phone call or an in-person interview does not.
ALTER TABLE interviews DROP CONSTRAINT interviews_link_needed;
ALTER TABLE interviews ADD CONSTRAINT interviews_link_needed
  CHECK (platform IN ('phone', 'in_person') OR meeting_url IS NOT NULL);

-- An in-person interview must say where; nothing else carries a place
ALTER TABLE interviews ADD CONSTRAINT interviews_location_shape
  CHECK ((platform = 'in_person' AND location IS NOT NULL) OR (platform <> 'in_person' AND location IS NULL));

-- Down Migration

ALTER TABLE interviews DROP CONSTRAINT interviews_location_shape;
ALTER TABLE interviews DROP CONSTRAINT interviews_link_needed;
ALTER TABLE interviews ADD CONSTRAINT interviews_link_needed CHECK (platform = 'phone' OR meeting_url IS NOT NULL);
ALTER TABLE interviews DROP CONSTRAINT interviews_platform_valid;
ALTER TABLE interviews ADD CONSTRAINT interviews_platform_valid
  CHECK (platform IN ('google_meet', 'microsoft_teams', 'zoom', 'phone', 'other'));
ALTER TABLE interviews DROP COLUMN location;
