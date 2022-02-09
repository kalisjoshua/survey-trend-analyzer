import {html, render, useEffect, useRef, useState} from './lib.js'

(function () {
  const appTarget = document.querySelector("[data-app]")
  const duplicates = [
    // [
    //   "I receive feedback from my direct leader that helps me improve my performance.",
    //   "I receive direct feedback from my leader that helps improve my performance.",
    // ],
    // [
    //   "I am comfortable going to my Team Relations Specialist with questions or concerns.",
    //   "I am comfortable going to my Team Relations Specialist/HR Business Partner with questions or concerns.",
    // ]
  ].reduce((acc, [primary, ...others]) => ({
    ...acc,
    [primary]: primary,
    ...others.reduce((group, alternate) => ({...group, [alternate]: primary}), {}),
  }), {})
  const rFilename = /(\d{4}(?:-\d)?)\.csv$/i
  const rOutletQuestion = /^"?(.*)"?((?:,(?:\d+(?:\.\d+)?)){3})$/
  const themeColors = [
    "green",
    "blue",
    "orange",
    "deepred",
    "deeppurple",
    "red",
    "orbit",
    "gray",
  ].map((name) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`))

  function App () {
    const [data, setData] = useState(false)

    return html`
      <${Files} setData=${setData} />

      <${QuestionsList} data=${data} />
    `
  }

  function BarGraphGrouped ({data}) {
    const datasets = data
      .map((ent, index) => ({
        backgroundColor: themeColors[index % themeColors.length],
        ...ent,
      }))
    const id = Math.random().toString(36).slice(2)
    // throw new Error("need to fix colors for Outlet results because there are only three values not five")

    useEffect(() => {
      const chart = new Chart(
        document.getElementById(id),
        {
          type: "bar",
          data: {
            datasets,
            labels: ["bad", "Meh", "Yay"],
          },
        }
      )

      return () => chart.destroy()
    })

    return html`<canvas id="${id}" role="img"></canvas>`
  }

  function BarGraphStacked ({data}) {
    const colors = (count, index) => ({
      3: ["#B81D13",            "#F4CD4D",            "#008450"],
      // colors: https://learnui.design/tools/data-color-picker.html#divergent
      5: ["#d43d51", "#eda86b", "#ffffcb", "#96c390", "#00876c"],
    }[data[count].data.length][index])

    return data
      .map((el, index) => {
        const gradient = el.data
          .map((n) => Math.round(n * 10000) / 100)
          // drop the last element because of the possibility of rounding errors or missing precision
          .slice(0, -1)
          // convert to a list of sequential sums from individual values
          // [25%, 50%, 25%] becomes [25%, 75%, 100%]
          // ... to make it simple for generating the css gradient strings
          .reduce((acc, n) => [...acc, n + (acc.slice(-1)[0] || 0)], [])
          // add in the final value to represent 100%
          .concat(100)
          .map((n, ix) => `${colors(index, ix)} 0%, ${colors(index, ix)} ${n}%`)
          .join(", ")

        return html`
          <div class="barGraphStacked">
            <span>${data[index].label}</span>
            <div style="background: linear-gradient(to right, ${gradient});" title="${data[index].label}"></div>
          </div>
        `
      })
  }

  function Files ({setData}) {
    let cache = {}
    const [hidden, setHidden] = useState([])
    const [uploads, setUploads] = useState([])
    const update = (files) => getData(files)
      .then((data) => setData(cache = data))

    function addFiles (event) {
      const names = uploads.map(({name}) => name)
      const allUploads = [...event.target.files]
        .reduce((acc, file) => {
          if (!names.includes(file.name) && rFilename.test(file.name)) {
            acc.push(file)
          }

          return acc
        }, [...uploads])
        .sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0)

      setUploads(allUploads)

      update(allUploads)
    }

    function datafileAttrs (name) {

      return {
         class: "datafile",
         // "data-empty": !!cache[name].length,
         "data-hidden": hidden.includes(name),
         "data-name": name,
         onClick: toggle,
      }
    }

    function remove (event) {
      event.stopPropagation()
      const {name} = event.target.dataset
      const remainingUploads = [...uploads]
        .filter(({name: n}) => n !== name)

      setHidden([...hidden].filter((n) => n !== name))
      setUploads(remainingUploads)

      update(remainingUploads)
    }

    function toggle (event) {
      event.stopPropagation()
      const {name} = event.target.dataset
      const newHidden = hidden.includes(name)
        ? [...hidden].filter((n) => n !== name)
        : [...hidden, name]
      const viewingUploads = uploads
        .filter(({name}) => !newHidden.includes(name))

      setHidden(newHidden)

      update(viewingUploads)
    }

    return html`
      <div class="filesUpload">
        <input multiple onChange="${addFiles}" type="file" />
      </div>

      <div class="filesUpload">
        ${uploads.map(({name}) => html`
        <span ...${datafileAttrs(name)}>
          ${rFilename.exec(name)[1]}
          <span class="close" data-name="${name}" onClick=${remove}>×</span>
        </span>
        `)}
      </div>
    `
  }

  function getData (files) {
    const pending = [...files]
      .map(getFileContents)
    const process = (data) => data
      .flatMap(parseFile)
      .reduce(groupByQuarter, {})

    return Promise.all(pending)
      .then(process)
  }

  function getFileContents (file) {

    return new Promise((resolve) => {
      const fileReader = new FileReader()

      fileReader.onload = (e) => resolve([
        rFilename.exec(file.name)[1],
        e.target.result,
      ])

      fileReader.readAsBinaryString(file)
    })
  }

  function groupByQuarter (acc, [quarter, text, responses]) {
    acc[text] = acc[text] || {}

    acc[text][quarter] = responses

    return acc
  }

  function parseFile ([quarter, contents]) {
    try {
      return contents
        .trim()
        .split(/[\n\r]+/)
        .slice(1)
        .reduce((acc, line) => {
          const [question, ...answers] = line
            .split(",")
            .map((part) => part.trim())

          acc.push([
            quarter,
            question,
            answers.map(Number),
          ])

          return acc
        }, [])
    } catch (e) {
      console.error(`Error reading: ${quarter}.`)
      console.info({contents})
    }
  }

  function QuestionDetail ([question, responseCounts]) {
    const data = Object.entries(responseCounts)
      .map((entry) => entry.reduce(dataSummaryReduce))
    const wrapper = useRef(null)

    useEffect(() => {
      wrapper.current.removeAttribute("open")
    })

    return html`
      <details class="figure" open ref=${wrapper}>
        <summary class="figcaption">
          ${question}
          <${BarGraphStacked} data=${data} />
        </summary>
        <${BarGraphGrouped} data=${data} />
      </details>
    `
  }

  function QuestionsList ({data}) {
    if (!data) return ""

    return Object.entries(data).map(QuestionDetail)
  }

  function dataSummaryReduce (label, raw) {
    const sum = raw.reduce((a, b) => a + b)
    const data = raw.map((n) => n / sum)

    return {data, label}
  }

  render(html`<${App} />`, appTarget)
}())
