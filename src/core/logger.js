/**
 * logger.js - chalk 日志封装
 *
 * 提供统一的终端彩色输出，包含成功、错误、警告、信息等日志级别
 */

import chalk from 'chalk'

/**
 * 日志工具类
 */
export const logger = {
  /**
   * 成功日志 - 绿色带勾号
   * @param {string} message - 日志消息
   */
  success(message) {
    console.log(chalk.green('✔'), message)
  },

  /**
   * 错误日志 - 红色带叉号
   * @param {string} message - 日志消息
   */
  error(message) {
    console.log(chalk.red('✗'), message)
  },

  /**
   * 警告日志 - 黄色带警告符号
   * @param {string} message - 日志消息
   */
  warn(message) {
    console.log(chalk.yellow('⚠'), message)
  },

  /**
   * 信息日志 - 蓝色带圆点
   * @param {string} message - 日志消息
   */
  info(message) {
    console.log(chalk.blue('●'), message)
  },

  /**
   * 普通日志
   * @param {string} message - 日志消息
   */
  log(message) {
    console.log(message)
  },

  /**
   * 提示日志 - 灰色带箭头
   * @param {string} message - 日志消息
   */
  hint(message) {
    console.log(chalk.gray('→'), chalk.gray(message))
  },

  /**
   * 标题日志 - 粗体
   * @param {string} message - 日志消息
   */
  title(message) {
    console.log()
    console.log(chalk.bold(message))
  },

  /**
   * 空行
   */
  newline() {
    console.log()
  },

  /**
   * 带颜色的成功消息（无符号）
   * @param {string} message - 日志消息
   */
  successText(message) {
    return chalk.green(message)
  },

  /**
   * 带颜色的错误消息（无符号）
   * @param {string} message - 日志消息
   */
  errorText(message) {
    return chalk.red(message)
  },

  /**
   * 带颜色的警告消息（无符号）
   * @param {string} message - 日志消息
   */
  warnText(message) {
    return chalk.yellow(message)
  },

  /**
   * 带颜色的信息消息（无符号）
   * @param {string} message - 日志消息
   */
  infoText(message) {
    return chalk.blue(message)
  },

  /**
   * 灰色文本
   * @param {string} message - 日志消息
   */
  dim(message) {
    return chalk.gray(message)
  },

  /**
   * 粗体文本
   * @param {string} message - 日志消息
   */
  bold(message) {
    return chalk.bold(message)
  },
}

export default logger
