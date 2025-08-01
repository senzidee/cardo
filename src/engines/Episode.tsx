// useful functions for episode management

import { useCallback, useEffect, useRef, useState } from 'react'
import { EpisodeData } from '..'
import { useSettings } from './Settings'
import { downloadEpisode, removeDownloadedEpisode } from '../utils/utils'
import { useDB, usePlayer } from '../ContextProviders'

export function useEpisode(episode: EpisodeData) {
  const { queue, history, downloads } = useDB()
  const [inQueue, setInqueue] = useState(queue.includes(episode.src))
  const [downloadState, setDownloadState] = useState<'downloaded' | ['downloading', number] | undefined>()
  const [reprState, setReprState] = useState({ position: 0, total: episode.duration, complete: false })
  const [
    {
      globals: { locale },
    },
  ] = useSettings()
  const { play: playEpisode, pause, paused, playing, quit: quitPlayer, audioRef } = usePlayer()
  const downloadedFile = useRef('')

  useEffect(() => {
    function updatePosition(e: React.SyntheticEvent<HTMLAudioElement>) {
      setReprState({ ...reprState, position: e.currentTarget.currentTime })
    }

    // when this episode is playing
    if (episode.src === playing?.src) {
      if (audioRef.current) {
        audioRef.current.ontimeupdate = updatePosition
      }
    }
  }, [episode.src, playing?.src])

  useEffect(() => {
    if (episode.src) {
      // avoid extra computing on db on large lists
      load()
    }
  }, [episode.src, playing?.src])

  const load = async () => {
    // update reproduction state
    const state = await history.get(episode.src)

    if (state !== undefined) {
      setReprState({ position: state.position, total: state.total, complete: state.position >= state.total })
    } else {
      // render a not played episode
      setReprState({ position: 0, total: episode.duration, complete: false })
    }

    // check if file is downloaded
    const downloadIndex = downloads.indexOf(episode.src)
    if (downloadIndex > -1) {
      setDownloadState('downloaded')
      downloadedFile.current = downloads.downloads[downloadIndex].localFile
    }
  }

  const getDateString = useCallback(() => {
    if (!episode.pubDate) return ''

    // set print date
    const episodeYear = episode.pubDate.getFullYear()
    const actualYear = new Date().getFullYear()

    return episode.pubDate.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: episodeYear < actualYear ? 'numeric' : undefined,
    })
  }, [episode.pubDate])

  const togglePlayed = () => {
    if (reprState.complete) {
      history.update(episode.src, episode.podcastUrl, 0, episode.duration)
      setReprState({ complete: false, position: 0, total: reprState.total })
    } else {
      history.update(episode.src, episode.podcastUrl, reprState.total, reprState.total)
      setReprState({ complete: true, position: reprState.total, total: reprState.total })
      if (playing?.src === episode.src) {
        quitPlayer()
      }
    }
  }

  const toggleQueue = async () => {
    if (inQueue) {
      await queue.remove(episode.src)
      setInqueue(false)
    } else {
      await queue.push(episode)
      setInqueue(true)
    }
  }

  const inProgress = useCallback(
    (mustBePlaying = false) => {
      const isStarted = reprState.position > 0 && !reprState.complete
      if (mustBePlaying) {
        return isStarted && playing?.src === episode.src && !paused
      } else {
        return isStarted
      }
    },
    [playing?.src, episode.src, reprState.position, reprState.complete, paused],
  )

  const download = async () => {
    setDownloadState(['downloading', 0])
    downloadEpisode(episode).then((localFile) => {
      // unlisten()
      setDownloadState('downloaded')
      downloadedFile.current = localFile
      downloads.addToDownloadList(episode, localFile)
    })

    // status could be readed
    // const unlisten = await listen<DownloadPayload>('downloading', ({payload: {src, downloaded, total}}) => {
    //   if (src == episode.src){
    //     setDownloadState(['downloading', downloaded / total * 100])
    //   }
    // })
  }

  const removeDownload = async () => {
    if (downloadState === 'downloaded') {
      await removeDownloadedEpisode(downloadedFile.current)
      await downloads.removeFromDownloadList(episode.src)
      setDownloadState(undefined)
    }
  }

  const toggleDownload = () => {
    if (!downloadState) {
      download()
    } else {
      removeDownload()
    }
  }

  const play = () => {
    if (downloadState === 'downloaded') {
      playEpisode(episode, downloadedFile.current)
    } else {
      playEpisode(episode)
    }
  }

  return {
    reprState,
    inQueue,
    getDateString,
    togglePlayed,
    toggleQueue,
    position: reprState.position,
    inProgress,
    toggleDownload,
    downloadState,
    play,
    pause,
  }
}
