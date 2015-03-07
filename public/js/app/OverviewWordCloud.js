import {Observable} from './utils';

class OverviewWordCloud {
  constructor() {
    this.progress = 0;
    this.words = {};
    this.excluded = {};
  }

  start(DataStreamer) {
    DataStreamer()
      .node("![*]", (data) => {
        this.words = data.tokens;
        this._dispatch("data", [this.words, this.progress]);
        this.updateProgress(data.progress);
        return oboe.drop;
      })
      .done(() => this._dispatch("done", [this.words, this.progress]));
  }

  updateProgress(newProgress) {
    var oldProgress = this.progress;
    if(newProgress > oldProgress) {
      this.progress = newProgress;
      this._dispatch("progress", [newProgress, oldProgress, this.words]);
    }
  }

  setExcludedWords(exclude) {
    for(var key in this.excluded) {
      this.words[key] = this.excluded[key];
    }

    this.excluded = {};
    exclude.forEach((word) => {
      this.excludeWord(word, false)
    });
    this._dispatch("inclusionchange", [this.words, this.excluded]);
  }

  includeWord(word, fireEvent) {
    if(this.excluded.hasOwnProperty(word)) {
      this.words[word] = this.excluded[word];
      delete this.excluded[word];      
    }
    if(fireEvent !== false) {
      this._dispatch("inclusionchange", [this.words, this.excluded]);
    }
  }

  excludeWord(word, fireEvent) {
    if(this.words.hasOwnProperty(word)) {
      this.excluded[word] = this.words[word];
      delete this.words[word];
    }
    if(fireEvent !== false) {
      this._dispatch("inclusionchange", [this.words, this.excluded]);
    }
  }
}

export default Observable(OverviewWordCloud);