import { promises as fs } from 'fs'
import path from 'path'
import { type PnpmError } from '@pnpm/error'
import { readProjects } from '@pnpm/filter-workspace-packages'
import { exec, run } from '@pnpm/plugin-commands-script-runners'
import { prepare, prepareEmpty, preparePackages } from '@pnpm/prepare'
import rimraf from '@zkochan/rimraf'
import execa from 'execa'
import { DEFAULT_OPTS, REGISTRY_URL } from './utils'

const pnpmBin = path.join(__dirname, '../../../pnpm/bin/pnpm.cjs')
const testOnPosixOnly = process.platform === 'win32' ? test.skip : test

test('pnpm recursive exec', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json && node -e "process.stdout.write(\'project-1\')" | json-append ../output2.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
        postbuild: 'node -e "process.stdout.write(\'project-2-postbuild\')" | json-append ../output1.json',
        prebuild: 'node -e "process.stdout.write(\'project-2-prebuild\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output2.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: true,
    selectedProjectsGraph,
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  const { default: outputs2 } = await import(path.resolve('output2.json'))

  expect(outputs1).toStrictEqual(['project-1', 'project-2-prebuild', 'project-2', 'project-2-postbuild'])
  expect(outputs2).toStrictEqual(['project-1', 'project-3'])
})

test('pnpm recursive exec finds bin files of workspace projects', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        cowsay: '1.5.0',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        cowsay: '1.5.0',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: true,
    selectedProjectsGraph,
  }, ['cowsay', 'hi'])

  // If there was no exception, the test passed
})

test('exec inside a workspace package', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json && node -e "process.stdout.write(\'project-1\')" | json-append ../output2.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
        postbuild: 'node -e "process.stdout.write(\'project-2-postbuild\')" | json-append ../output1.json',
        prebuild: 'node -e "process.stdout.write(\'project-2-prebuild\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output2.json',
      },
    },
  ])

  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: path.resolve('project-1'),
    recursive: false,
    selectedProjectsGraph: {},
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  const { default: outputs2 } = await import(path.resolve('output2.json'))

  expect(outputs1).toStrictEqual(['project-1'])
  expect(outputs2).toStrictEqual(['project-1'])
})

test('pnpm recursive exec sets PNPM_PACKAGE_NAME env var', async () => {
  preparePackages([
    {
      name: 'foo',
      version: '1.0.0',
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: true,
    selectedProjectsGraph,
  }, ['node', '-e', 'require(\'fs\').writeFileSync(\'pkgname\', process.env.PNPM_PACKAGE_NAME, \'utf8\')'])

  expect(await fs.readFile('foo/pkgname', 'utf8')).toBe('foo')
})

test('testing the bail config with "pnpm recursive exec"', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'exit 1 && node -e "process.stdout.write(\'project-2\')" | json-append ../output.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])

  let failed = false
  let err1!: PnpmError
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      recursive: true,
      selectedProjectsGraph,
    }, ['npm', 'run', 'build', '--no-bail'])
  } catch (_err: any) { // eslint-disable-line
    err1 = _err
    failed = true
  }
  expect(err1.code).toBe('ERR_PNPM_RECURSIVE_FAIL')
  expect(failed).toBeTruthy()

  const { default: outputs } = await import(path.resolve('output.json'))
  expect(outputs).toStrictEqual(['project-1', 'project-3'])

  await rimraf('./output.json')

  failed = false
  let err2!: PnpmError
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      recursive: true,
      selectedProjectsGraph,
    }, ['npm', 'run', 'build'])
  } catch (_err: any) { // eslint-disable-line
    err2 = _err
    failed = true
  }

  expect(err2.code).toBe('ERR_PNPM_RECURSIVE_FAIL')
  expect(failed).toBeTruthy()
})

test('pnpm recursive exec --no-sort', async () => {
  preparePackages([
    {
      name: 'a-dependent',
      version: '1.0.0',

      dependencies: {
        'b-dependency': '1.0.0',
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'a-dependent\')" | json-append ../output.json',
      },
    },
    {
      name: 'b-dependency',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'b-dependency\')" | json-append ../output.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: true,
    selectedProjectsGraph,
    sort: false,
    workspaceConcurrency: 1,
  }, ['npm', 'run', 'build'])

  const { default: outputs } = await import(path.resolve('output.json'))

  expect(outputs).toStrictEqual(['a-dependent', 'b-dependency'])
})

test('pnpm recursive exec --reverse', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output1.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    selectedProjectsGraph,
    recursive: true,
    sort: true,
    reverse: true,
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))

  expect(outputs1[outputs1.length - 1]).toBe('project-1')
})

test('pnpm exec on single project', async () => {
  prepare({})

  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: false,
    selectedProjectsGraph: {},
  }, ['node', '-e', 'require("fs").writeFileSync("output.json", "[]", "utf8")'])

  const { default: outputs } = await import(path.resolve('output.json'))
  expect(outputs).toStrictEqual([])
})

test('pnpm exec on single project should return non-zero exit code when the process fails', async () => {
  prepare({})

  {
    const { exitCode } = await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      recursive: false,
      selectedProjectsGraph: {},
    }, ['node', '-e', 'process.exitCode=1'])

    expect(exitCode).toBe(1)
  }

  {
    const runResult = await run.handler({
      ...DEFAULT_OPTS,
      argv: {
        original: ['pnpm', 'node', '-e', 'process.exitCode=1'],
      },
      dir: process.cwd(),
      fallbackCommandUsed: true,
      recursive: false,
      selectedProjectsGraph: {},
    }, ['node'])

    expect(runResult).toHaveProperty(['exitCode'], 1)
  }
})

test('pnpm exec outside of projects', async () => {
  prepareEmpty()

  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: false,
    selectedProjectsGraph: {},
  }, ['node', '-e', 'require("fs").writeFileSync("output.json", "[]", "utf8")'])

  const { default: outputs } = await import(path.resolve('output.json'))
  expect(outputs).toStrictEqual([])
})

test('pnpm exec shell mode', async () => {
  prepareEmpty()

  const echoArgs = process.platform === 'win32' ? '%PNPM_PACKAGE_NAME% > name.txt' : '$PNPM_PACKAGE_NAME > name.txt'

  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: false,
    selectedProjectsGraph: {
      [process.cwd()]: {
        dependencies: [],
        package: {
          dir: process.cwd(),
          writeProjectManifest: async () => {},
          manifest: {
            name: 'test_shell_mode',
          },
        },
      },
    },
    shellMode: true,
  }, ['echo', echoArgs])

  const result = (await fs.readFile(path.resolve('name.txt'), 'utf8')).trim()

  expect(result).toBe('test_shell_mode')
})

// This test is not stable on Windows
testOnPosixOnly('pnpm recursive exec works with PnP', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json && node -e "process.stdout.write(\'project-1\')" | json-append ../output2.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
        postbuild: 'node -e "process.stdout.write(\'project-2-postbuild\')" | json-append ../output1.json',
        prebuild: 'node -e "process.stdout.write(\'project-2-prebuild\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output2.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ], {
    env: {
      NPM_CONFIG_NODE_LINKER: 'pnp',
      NPM_CONFIG_SYMLINK: 'false',
    },
  })
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    recursive: true,
    selectedProjectsGraph,
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  const { default: outputs2 } = await import(path.resolve('output2.json'))

  expect(outputs1).toStrictEqual(['project-1', 'project-2-prebuild', 'project-2', 'project-2-postbuild'])
  expect(outputs2).toStrictEqual(['project-1', 'project-3'])
})

test('pnpm recursive exec --resume-from should work', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-4',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-4\')" | json-append ../output1.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    dir: process.cwd(),
    selectedProjectsGraph,
    recursive: true,
    sort: true,
    resumeFrom: 'project-3',
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  expect(outputs1).not.toContain('project-1')
  expect(outputs1).not.toContain('project-4')
  expect(outputs1).toContain('project-2')
  expect(outputs1).toContain('project-3')
})

test('should throw error when the package specified by resume-from does not exist', async () => {
  preparePackages([
    {
      name: 'foo',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'echo foo',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])

  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      selectedProjectsGraph,
      recursive: true,
      sort: true,
      resumeFrom: 'project-2',
    }, ['npm', 'run', 'build'])
  } catch (err: any) { // eslint-disable-line
    expect(err.code).toBe('ERR_PNPM_RESUME_FROM_NOT_FOUND')
  }
})

test('pnpm exec in directory with path delimiter', async () => {
  preparePackages([
    {
      name: `foo${path.delimiter}delimiter`,
      version: '1.0.0',
      dependencies: {
        cowsay: '1.5.0',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY_URL,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])

  let error
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      selectedProjectsGraph,
      recursive: true,
    }, ['cowsay', 'hi'])
  } catch (err: any) { // eslint-disable-line
    error = err
  }
  expect(error).toBeUndefined()
})

test('pnpm recursive exec report summary', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',
      scripts: {
        build: 'node -e "setTimeout(() => console.log(\'project-1\'), 1000)"',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      scripts: {
        build: 'exit 1',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      scripts: {
        build: 'node -e "setTimeout(() => console.log(\'project-3\'), 1000)"',
      },
    },
    {
      name: 'project-4',
      version: '1.0.0',
      scripts: {
        build: 'exit 1',
      },
    },
  ])
  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  let error
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      selectedProjectsGraph,
      recursive: true,
      reportSummary: true,
      workspaceConcurrency: 3,
    }, ['npm', 'run', 'build'])
  } catch (err: any) { // eslint-disable-line
    error = err
  }
  expect(error.code).toBe('ERR_PNPM_RECURSIVE_FAIL')

  const { default: { executionStatus } } = (await import(path.resolve('pnpm-exec-summary.json')))
  expect(executionStatus[path.resolve('project-1')].status).toBe('passed')
  expect(executionStatus[path.resolve('project-1')].duration).not.toBeFalsy()
  expect(executionStatus[path.resolve('project-2')].status).toBe('failure')
  expect(executionStatus[path.resolve('project-2')].duration).not.toBeFalsy()
  expect(executionStatus[path.resolve('project-3')].status).toBe('passed')
  expect(executionStatus[path.resolve('project-3')].duration).not.toBeFalsy()
  expect(executionStatus[path.resolve('project-4')].status).toBe('failure')
  expect(executionStatus[path.resolve('project-4')].duration).not.toBeFalsy()
})

test('pnpm recursive exec report summary with --bail', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',
      scripts: {
        build: 'node -e "setTimeout(() => console.log(\'project-1\'), 1000)"',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      scripts: {
        build: 'exit 1',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      scripts: {
        build: 'node -e "setTimeout(() => console.log(\'project-3\'), 1000)"',
      },
    },
    {
      name: 'project-4',
      version: '1.0.0',
      scripts: {
        build: 'exit 1',
      },
    },
  ])
  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  let error
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      dir: process.cwd(),
      selectedProjectsGraph,
      recursive: true,
      reportSummary: true,
      bail: true,
      workspaceConcurrency: 3,
    }, ['npm', 'run', 'build'])
  } catch (err: any) { // eslint-disable-line
    error = err
  }
  expect(error.code).toBe('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL')

  const { default: { executionStatus } } = (await import(path.resolve('pnpm-exec-summary.json')))

  expect(executionStatus[path.resolve('project-1')].status).toBe('running')
  expect(executionStatus[path.resolve('project-2')].status).toBe('failure')
  expect(executionStatus[path.resolve('project-2')].duration).not.toBeFalsy()
  expect(executionStatus[path.resolve('project-3')].status).toBe('running')
  expect(executionStatus[path.resolve('project-4')].status).toBe('queued')
})
