import fs from 'fs'
import path from 'path'
import { docsUrl } from '@pnpm/cli-utils'
import { type Config, types as allTypes } from '@pnpm/config'
import { install } from '@pnpm/plugin-commands-installation'
import { readPackageJsonFromDir } from '@pnpm/read-package-json'
import { tryReadProjectManifest } from '@pnpm/read-project-manifest'
import normalizePath from 'normalize-path'
import pick from 'ramda/src/pick'
import execa from 'safe-execa'
import escapeStringRegexp from 'escape-string-regexp'
import renderHelp from 'render-help'
import tempy from 'tempy'
import { writePackage } from './writePackage'
import { parseWantedDependency } from '@pnpm/parse-wanted-dependency'

export const rcOptionsTypes = cliOptionsTypes

export function cliOptionsTypes () {
  return pick(['patches-dir'], allTypes)
}

export const commandNames = ['patch-commit']

export function help () {
  return renderHelp({
    description: 'Generate a patch out of a directory',
    descriptionLists: [{
      title: 'Options',
      list: [
        {
          description: 'The generated patch file will be saved to this directory',
          name: '--patches-dir',
        },
      ],
    }],
    url: docsUrl('patch-commit'),
    usages: ['pnpm patch-commit <patchDir>'],
  })
}

export async function handler (opts: install.InstallCommandOptions & Pick<Config, 'patchesDir' | 'rootProjectManifest'>, params: string[]) {
  const userDir = params[0]
  const lockfileDir = opts.lockfileDir ?? opts.dir ?? process.cwd()
  const patchesDirName = normalizePath(path.normalize(opts.patchesDir ?? 'patches'))
  const patchesDir = path.join(lockfileDir, patchesDirName)
  await fs.promises.mkdir(patchesDir, { recursive: true })
  const patchedPkgManifest = await readPackageJsonFromDir(userDir)
  const pkgNameAndVersion = `${patchedPkgManifest.name}@${patchedPkgManifest.version}`
  const srcDir = tempy.directory()
  await writePackage(parseWantedDependency(pkgNameAndVersion), srcDir, opts)
  const patchContent = await diffFolders(srcDir, userDir)
  const patchFileName = pkgNameAndVersion.replace('/', '__')
  await fs.promises.writeFile(path.join(patchesDir, `${patchFileName}.patch`), patchContent, 'utf8')
  const { writeProjectManifest, manifest } = await tryReadProjectManifest(lockfileDir)

  const rootProjectManifest = opts.rootProjectManifest ?? manifest ?? {}

  if (!rootProjectManifest.pnpm) {
    rootProjectManifest.pnpm = {
      patchedDependencies: {},
    }
  } else if (!rootProjectManifest.pnpm.patchedDependencies) {
    rootProjectManifest.pnpm.patchedDependencies = {}
  }
  rootProjectManifest.pnpm.patchedDependencies![pkgNameAndVersion] = `${patchesDirName}/${patchFileName}.patch`
  await writeProjectManifest(rootProjectManifest)

  if (opts?.selectedProjectsGraph?.[lockfileDir]) {
    opts.selectedProjectsGraph[lockfileDir].package.manifest = rootProjectManifest
  }

  if (opts?.allProjectsGraph?.[lockfileDir].package.manifest) {
    opts.allProjectsGraph[lockfileDir].package.manifest = rootProjectManifest
  }

  return install.handler(opts)
}

async function diffFolders (folderA: string, folderB: string) {
  const folderAN = folderA.replace(/\\/g, '/')
  const folderBN = folderB.replace(/\\/g, '/')
  let stdout!: string
  let stderr!: string

  try {
    const result = await execa('git', ['-c', 'core.safecrlf=false', 'diff', '--src-prefix=a/', '--dst-prefix=b/', '--ignore-cr-at-eol', '--irreversible-delete', '--full-index', '--no-index', '--text', folderAN, folderBN], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // #region Predictable output
        // These variables aim to ignore the global git config so we get predictable output
        // https://git-scm.com/docs/git#Documentation/git.txt-codeGITCONFIGNOSYSTEMcode
        GIT_CONFIG_NOSYSTEM: '1',
        HOME: '',
        XDG_CONFIG_HOME: '',
        USERPROFILE: '',
        // #endregion
      },
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (err: any) { // eslint-disable-line
    stdout = err.stdout
    stderr = err.stderr
  }
  // we cannot rely on exit code, because --no-index implies --exit-code
  // i.e. git diff will exit with 1 if there were differences
  if (stderr.length > 0)
    throw new Error(`Unable to diff directories. Make sure you have a recent version of 'git' available in PATH.\nThe following error was reported by 'git':\n${stderr}`)

  return stdout
    .replace(new RegExp(`(a|b)(${escapeStringRegexp(`/${removeTrailingAndLeadingSlash(folderAN)}/`)})`, 'g'), '$1/')
    .replace(new RegExp(`(a|b)${escapeStringRegexp(`/${removeTrailingAndLeadingSlash(folderBN)}/`)}`, 'g'), '$1/')
    .replace(new RegExp(escapeStringRegexp(`${folderAN}/`), 'g'), '')
    .replace(new RegExp(escapeStringRegexp(`${folderBN}/`), 'g'), '')
    .replace(/\n\\ No newline at end of file$/, '')
}

function removeTrailingAndLeadingSlash (p: string) {
  if (p.startsWith('/') || p.endsWith('/')) {
    return p.replace(/^\/|\/$/g, '')
  }
  return p
}
