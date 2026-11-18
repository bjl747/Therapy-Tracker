import type { TemplateDef } from './types'
import { TRAVEL_JOB_POST } from './jobPost'
import { HOT_JOBS_ROUNDUP } from './roundup'

/** templates shipped in code; managers' saved templates come from the repo */
export const BUILT_IN_TEMPLATES: TemplateDef[] = [TRAVEL_JOB_POST, HOT_JOBS_ROUNDUP]

export type { TemplateDef } from './types'
