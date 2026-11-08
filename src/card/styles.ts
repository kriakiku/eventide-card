import { css } from 'lit'

export const cardStyles = css`
  :host {
    display: block;
    height: 100%;
    --eventide-row: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    --eventide-tile: var(--ha-card-background, var(--card-background-color, transparent));
  }
  ha-card {
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    overflow: hidden;
    color: var(--primary-text-color);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    height: 100%;
  }
  .layout.wide {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 24px;
  }
  button {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .head .title {
    font-size: 18px;
    font-weight: 600;
    padding: 8px 4px;
  }
  .nav {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    color: var(--secondary-text-color);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }
  .dow {
    text-align: center;
    font-size: 12px;
    padding: 4px 0;
    color: var(--secondary-text-color);
  }
  .day {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 66px;
    max-height: 13vh;
    min-height: 44px;
    font-size: 15px;
  }
  .day::before {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 12px;
  }
  .day.busy::before {
    background: color-mix(in srgb, var(--c) 26%, transparent);
  }
  .day.today::before {
    background: var(--primary-color);
  }
  .day.selected::before {
    outline: 2px solid var(--primary-text-color);
    outline-offset: -2px;
  }
  .day span {
    position: relative;
  }
  .day.today {
    font-weight: 600;
    color: var(--text-primary-color, #fff);
  }
  .day.out {
    color: var(--disabled-text-color, var(--secondary-text-color));
  }
  .agenda {
    min-width: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .group {
    font-size: 13px;
    color: var(--secondary-text-color);
    margin: 14px 0 8px;
  }
  .group:first-child {
    margin-top: 6px;
  }
  .row {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    height: 64px;
    padding: 0 14px 0 9px;
    margin-bottom: 8px;
    border: 1.5px solid transparent;
    border-radius: 16px;
    background: var(--eventide-row);
  }
  .row.soon {
    border: 1.5px dashed var(--c);
  }
  .row.running {
    border: 1.5px solid var(--c);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--c) 30%, transparent);
  }
  .tile,
  .text,
  .eta {
    position: relative;
  }
  .tile {
    flex: none;
    box-sizing: border-box;
    width: 42px;
    height: 46px;
    text-align: center;
    border: 1.5px solid var(--c);
    border-radius: 11px;
    background: var(--eventide-tile);
    overflow: hidden;
  }
  .tile small {
    display: block;
    font-size: 11px;
    line-height: 17px;
    color: var(--secondary-text-color);
    border-bottom: 1px solid var(--divider-color);
  }
  .tile b {
    display: block;
    font-size: 16px;
    font-weight: 600;
    line-height: 25px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
  }
  .summary span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .summary ha-icon {
    flex: none;
    --mdc-icon-size: 18px;
  }
  .sub {
    font-size: 12.5px;
    line-height: 18px;
    color: var(--secondary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .eta {
    flex: none;
    text-align: right;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 16px;
  }
  .row.finished .tile {
    border-color: var(--divider-color);
  }
  .row.finished .tile b,
  .row.finished .summary,
  .row.finished .eta {
    color: var(--secondary-text-color);
  }
  .row.finished .eta {
    font-weight: 400;
  }
  .empty {
    padding: 24px 4px;
    color: var(--secondary-text-color);
  }
`
