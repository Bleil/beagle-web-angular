/*
  * Copyright 2020 ZUP IT SERVICOS EM TECNOLOGIA E INOVACAO SA
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *
  *  http://www.apache.org/licenses/LICENSE-2.0
  *
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
*/

import { writeFileSync, copyFileSync } from 'fs'
import { dirname } from 'path'
import 'amd-loader'
import 'reflect-metadata'
import BeagleCliError, { isBeagleCliError } from '../../errors'
import { ensureDirectoryExistence, getImportFilePath } from '../../utils/filesystem'
import { logError, logSuccess } from '../../utils/styledLogger'
import { getPackageVersion } from '../../utils/packages'
import BeagleCodeGenerationError from '../../../codegen/errors'
import { generateViewEngineCode } from '../../../codegen/compiled/beagle.module'
import { BeagleAngularConfig } from '../../../types'
import { getViewEngineConfig, getBeagleModuleCopyPath } from './config'

function getBeagleMetadataFromExports(allExports: Record<string, any>) {
  const keys = Object.keys(allExports)
  let beagleModuleName: string | undefined
  let config: BeagleAngularConfig<any> | undefined

  keys.forEach(key => {
    config = Reflect.getMetadata('beagleConfig', allExports[key])
    if (config) beagleModuleName = key
  })

  if (!beagleModuleName) {
    throw new BeagleCliError(
      'Could not find a beagle module. Please, make sure you annotated your class with @BeagleModule',
    )
  }

  return { beagleModuleName, config: config as BeagleAngularConfig<any> }
}

function getBeagleMetadata(beagleModulePath: string) {
  let beagleFileExports: Record<string, any>

  try {
    beagleFileExports = require(beagleModulePath)
  } catch (error) {
    if (typeof error.message !== 'string') throw error
    if (error.message.startsWith('Cannot find module')) {
      throw new BeagleCliError(`Could not find the beagle module file at "${beagleModulePath}".`)
    }
    if (error.message.match('Unable to compile TypeScript')) {
      throw new BeagleCliError(`Unable to compile TypeScript, see the error below:\n\n${error.message}`)
    }
    throw error
  }

  return getBeagleMetadataFromExports(beagleFileExports)
}

export function start() {
  const viewEngineConfig = getViewEngineConfig()
  const { beagleModuleName, config } = getBeagleMetadata(viewEngineConfig.beagleModulePath)
  const beagleModuleCopyPath = getBeagleModuleCopyPath(viewEngineConfig.beagleModulePath)
  let fileContent: string

  try {
    fileContent = generateViewEngineCode({
      config,
      beagleModuleName,
      beagleModuleCopyPath: getImportFilePath(viewEngineConfig.outputPath, beagleModuleCopyPath),
      angularVersion: getPackageVersion('@angular/core'),
    })
  } catch (error) {
    if (error.name !== BeagleCodeGenerationError.name) throw error
    throw new BeagleCliError(`${error.message}. Be sure you replaced all "todos" in the boilerplate code generated by beagle init.`)
  }
  
  ensureDirectoryExistence(viewEngineConfig.outputPath)
  writeFileSync(viewEngineConfig.outputPath, fileContent)
  copyFileSync(viewEngineConfig.beagleModulePath, beagleModuleCopyPath)

  logSuccess(`Beagle module files have been successfully generated at "${dirname(viewEngineConfig.outputPath)}"!`)
}

try {
  start()
} catch (error) {
  if (!isBeagleCliError) throw error
  logError(error.message)
  process.exit(error.exitCode)
}