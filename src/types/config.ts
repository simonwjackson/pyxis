export type PandoraConfig = {
  readonly username: string
  readonly password: string
}

export type DeviceKey = {
  readonly username: string
  readonly password: string
  readonly deviceId: string
  readonly encryptKey: string
  readonly decryptKey: string
}
