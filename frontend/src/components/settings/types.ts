export interface FieldSchema {
  type: 'string' | 'boolean' | 'integer' | 'float' | 'list'
  label: string
  description?: string
  min?: number
  max?: number
  step?: number
  enum?: string[]
}

export interface SectionSchema {
  label: string
  icon: string
  fields: Record<string, FieldSchema>
}

export type Schema = Record<string, SectionSchema>

export interface SectionDef {
  key: string
  icon: string
  labelKey: string
  type: 'schema' | 'providers' | 'credential-pool' | 'auxiliary' | 'env-provider' | 'env-tool' | 'env-messaging' | 'env-setting'
}
