import React from 'react';
import styles from './SourceRenderer.module.css';
import classnames from 'classnames';
import { head, sortBy } from 'lodash';

interface Props {
  score: number;
}

const scoreConfig = {
  great: {
    score: 0.9,
    className: styles.greatMatch,
    text: 'Great match',
  },
  good: {
    score: 0.8,
    className: styles.goodMatch,
    text: 'Good match',
  },
  ok: {
    score: 0.75,
    className: styles.okMatch,
    text: 'Average match',
  },
  bad: {
    score: 0.65,
    className: styles.badMatch,
    text: 'Bad match',
  },
  noMatch: {
    score: 0.0,
    className: styles.noMatch,
    text: 'No match',
  },
};

export const ScoreView = ({ score }: Props) => {
  const title = `Score: ${Math.round(score * Math.pow(10, 2)) /
    Math.pow(10, 2)}`;

  let config = head(
    sortBy(
      Object.entries(scoreConfig),
      ([, { score: scoreConfigScore }]) => -scoreConfigScore
    ).filter(([, { score: scoreConfigScore }]) => score >= scoreConfigScore)
  )?.[1];

  if (config == null) {
    return (
      <div className={styles.sourceDetailScoreLine}>
        <div className={classnames(styles.sourceDetailScore)}>{title}</div>
      </div>
    );
  }

  return (
    <div className={styles.sourceDetailScoreLine}>
      <div
        className={classnames(styles.sourceDetailScore, config.className)}
        title={title}
      >
        {config.text}
      </div>
    </div>
  );
};
