import { css } from 'lit'

export const cardStyles = css`
  :host {
    --eventide-corner: superellipse(1.6);
    display: block;
    height: 100%;
    --eventide-row: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    --eventide-tile: var(--ha-card-background, var(--card-background-color, transparent));
  }
  ha-card {
    corner-shape: var(--eventide-corner);
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    overflow: hidden;
    color: var(--primary-text-color);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 16px;
    height: 100%;
  }
  .layout.list-only {
    grid-template-rows: minmax(0, 1fr);
  }
  .layout.wide {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    grid-template-rows: minmax(0, 1fr);
    max-height: calc(100vh - 32px);
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
    font-size: 24px;
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
    font-size: 15px;
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
    font-size: 20px;
  }
  .day::before {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 15px;
    corner-shape: var(--eventide-corner);
  }
  .day.busy::before {
    background: var(--bg);
  }
  .day.today::before {
    background: var(--eventide-today, var(--primary-color));
  }
  .day.selected::before {
    outline: 2px solid var(--primary-text-color);
    outline-offset: -2px;
  }
  .num {
    position: relative;
    transform: translateY(-11px);
  }
  .dots {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(50% + 4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .dot-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 7px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  .more {
    font-size: 11px;
    font-weight: 600;
    line-height: 7px;
    color: var(--secondary-text-color);
  }
  .day.today .dot {
    background: var(--text-primary-color, #fff);
  }
  .day.today .more {
    color: var(--text-primary-color, #fff);
  }
  .day.today {
    font-weight: 600;
    color: var(--text-primary-color, #fff);
  }
  .day.out {
    color: var(--disabled-text-color, var(--secondary-text-color));
  }
  .calendar {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .clock {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0;
    font-size: 44px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .agenda {
    --fade-top: 0px;
    --fade-bottom: 0px;
    min-width: 0;
    overflow-y: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--fade-top),
      #000 calc(100% - var(--fade-bottom)),
      transparent 100%
    );
  }
  .agenda.fade-top {
    --fade-top: 36px;
  }
  .agenda.fade-bottom {
    --fade-bottom: 56px;
  }
  .group {
    font-size: 16px;
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
    height: 72px;
    padding: 0 14px 0 10px;
    margin-bottom: 8px;
    border: 1.5px solid transparent;
    border-radius: 20px;
    corner-shape: var(--eventide-corner);
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
    width: 48px;
    height: 54px;
    text-align: center;
    border: 1.5px solid var(--c);
    border-radius: 14px;
    corner-shape: var(--eventide-corner);
    background: var(--eventide-tile);
    overflow: hidden;
  }
  .tile small {
    display: block;
    font-size: 13px;
    line-height: 20px;
    color: var(--secondary-text-color);
    border-bottom: 1px solid var(--divider-color);
  }
  .tile b {
    display: block;
    font-size: 19px;
    font-weight: 600;
    line-height: 29px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 19px;
    font-weight: 600;
    line-height: 25px;
  }
  .summary span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .summary ha-icon {
    flex: none;
    --mdc-icon-size: 22px;
  }
  .sub {
    font-size: 15px;
    line-height: 20px;
    color: var(--secondary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .eta {
    flex: none;
    text-align: right;
    font-size: 15px;
    font-weight: 600;
    line-height: 19px;
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
    font-size: 18px;
    padding: 24px 4px;
    color: var(--secondary-text-color);
  }
`
