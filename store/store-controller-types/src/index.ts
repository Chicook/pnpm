import {
  type DirectoryResolution,
  type PreferredVersions,
  type Resolution,
  type WantedDependency,
  type WorkspacePackages,
} from '@pnpm/resolver-base'
import type {
  ImportPackageFunction,
  PackageFileInfo,
  PackageFilesResponse,
} from '@pnpm/cafs-types'
import {
  type DependencyManifest,
  type PackageManifest,
} from '@pnpm/types'

export type { PackageFileInfo, PackageFilesResponse, ImportPackageFunction }

export * from '@pnpm/resolver-base'
export type BundledManifest = Pick<
DependencyManifest,
| 'bin'
| 'bundledDependencies'
| 'bundleDependencies'
| 'dependencies'
| 'directories'
| 'engines'
| 'name'
| 'optionalDependencies'
| 'os'
| 'peerDependencies'
| 'peerDependenciesMeta'
| 'scripts'
| 'version'
>

export interface UploadPkgToStoreOpts {
  filesIndexFile: string
  sideEffectsCacheKey: string
}

export type UploadPkgToStore = (builtPkgLocation: string, opts: UploadPkgToStoreOpts) => Promise<void>

export interface StoreController {
  requestPackage: RequestPackageFunction
  fetchPackage: FetchPackageToStoreFunction
  getFilesIndexFilePath: GetFilesIndexFilePath
  importPackage: ImportPackageFunction
  close: () => Promise<void>
  prune: () => Promise<void>
  upload: UploadPkgToStore
}

export type FetchPackageToStoreFunction = (
  opts: FetchPackageToStoreOptions
) => {
  bundledManifest?: BundledManifestFunction
  filesIndexFile: string
  files: () => Promise<PackageFilesResponse>
  finishing: () => Promise<void>
}

export type GetFilesIndexFilePath = (opts: Pick<FetchPackageToStoreOptions, 'pkg' | 'ignoreScripts'>) => {
  filesIndexFile: string
  target: string
}

export interface PkgNameVersion {
  name?: string
  version?: string
}

export interface FetchPackageToStoreOptions {
  fetchRawManifest?: boolean
  force: boolean
  ignoreScripts?: boolean
  lockfileDir: string
  pkg: PkgNameVersion & {
    id: string
    resolution: Resolution
  }
  /**
   * Expected package is the package name and version that are found in the lockfile.
   */
  expectedPkg?: PkgNameVersion
}

export type RequestPackageFunction = (
  wantedDependency: WantedDependency & { optional?: boolean },
  options: RequestPackageOptions
) => Promise<PackageResponse>

export interface RequestPackageOptions {
  alwaysTryWorkspacePackages?: boolean
  currentPkg?: {
    id?: string
    resolution?: Resolution
  }
  /**
   * Expected package is the package name and version that are found in the lockfile.
   */
  expectedPkg?: PkgNameVersion
  defaultTag?: string
  pickLowestVersion?: boolean
  publishedBy?: Date
  downloadPriority: number
  ignoreScripts?: boolean
  projectDir: string
  lockfileDir: string
  preferredVersions: PreferredVersions
  preferWorkspacePackages?: boolean
  registry: string
  sideEffectsCache?: boolean
  skipFetch?: boolean
  update?: boolean
  workspacePackages?: WorkspacePackages
  forceResolve?: boolean
}

export type BundledManifestFunction = () => Promise<BundledManifest | undefined>

export interface PackageResponse {
  bundledManifest?: BundledManifestFunction
  files?: () => Promise<PackageFilesResponse>
  filesIndexFile?: string
  finishing?: () => Promise<void> // a package request is finished once its integrity is generated and saved
  body: {
    isLocal: boolean
    isInstallable?: boolean
    resolution: Resolution
    manifest?: PackageManifest
    id: string
    normalizedPref?: string
    updated: boolean
    publishedAt?: string
    resolvedVia?: string
    // This is useful for recommending updates.
    // If latest does not equal the version of the
    // resolved package, it is out-of-date.
    latest?: string
  } & (
    {
      isLocal: true
      resolution: DirectoryResolution
    } | {
      isLocal: false
    }
  )
}

export type FilesMap = Record<string, string>

export interface ImportOptions {
  filesMap: FilesMap
  force: boolean
  fromStore: boolean
  keepModulesDir?: boolean
}

export type ImportIndexedPackage = (to: string, opts: ImportOptions) => Promise<string | undefined>
