const TEMPO_SEQ = 'TempO-Seq';

export function validateProjectIntake(project) {
  const errors = [];

  const requiredStrings = [
    ['title', 'Project title is required.'],
    ['pi_name', 'PI name is required.'],
    ['researcher_name', 'Researcher name is required.'],
    ['status', 'Status is required.'],
    ['intake_platform', 'Platform is required.'],
    ['client_user', 'Client assignment is required.'],
  ];

  for (const [field, message] of requiredStrings) {
    const value = project?.[field];
    if (typeof value !== 'string' && field !== 'client_user') {
      errors.push({ field, message });
      continue;
    }
    if (field !== 'client_user' && value.trim().length === 0) errors.push({ field, message });
    if (field === 'client_user' && !value) errors.push({ field, message });
  }

  if (project?.intake_platform === TEMPO_SEQ) {
    if (!project?.biospyder_manifest) {
      errors.push({
        field: 'biospyder_manifest',
        message: 'Biospyder manifest is required when platform is TempO-Seq.',
      });
    }
    const dbs = project?.biospyder_databases;
    const hasAnyDb = Array.isArray(dbs) ? dbs.length > 0 : !!dbs;
    if (!hasAnyDb) {
      errors.push({
        field: 'biospyder_databases',
        message: 'At least one Biospyder database is required when platform is TempO-Seq.',
      });
    }
  }

  if (project?.status === 'intake_ready' || project?.status === 'active') {
    if (!project?.bioinformatician_assigned) {
      errors.push({
        field: 'bioinformatician_assigned',
        message: 'Assigned bioinformatician is required before intake can be marked ready/active.',
      });
    }
    if (!project?.description || String(project.description).trim().length === 0) {
      errors.push({
        field: 'description',
        message: 'Description is required before intake can be marked ready/active.',
      });
    }
  }

  return errors;
}

export function enforceClientOwnership({ input, existing, accountability }) {
  if (!accountability?.user) return { ...input };
  if (accountability?.admin) return { ...input };

  const targetOwner = input?.client_user ?? existing?.client_user;
  if (!targetOwner) return { ...input, client_user: accountability.user };

  if (String(targetOwner) !== String(accountability.user)) {
    return { ...input, client_user: accountability.user };
  }

  return { ...input };
}

